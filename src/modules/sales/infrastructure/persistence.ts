import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { crmCalls, crmConversations, crmDeals, crmNotes, crmPipelines, crmStageHistory, crmStages, crmTasks } from "@/lib/db/schema";
import { phoneKey } from "@/lib/crm/phone";
import { executor } from "@/shared/infrastructure/database";
import { Deal, Funnel, type DealRepository, type FunnelRepository, type NoteKind, type Stage } from "../domain";

type Row = typeof crmDeals.$inferSelect;

export const phoneDigits = (col: unknown) => sql`right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`;
/** Номер среди дополнительных телефонов (хранятся нормализованными цифрами). */
export const inExtra = (col: unknown, key: string) => sql`exists (select 1 from unnest(${col}) p where right(p, 10) = ${key})`;

function toDomain(r: Row): Deal {
  return Deal.restore(r.id, {
    number: r.number,
    title: r.title,
    stageId: r.stageId,
    source: r.source,
    clientId: r.clientId,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    contactEmail: r.contactEmail,
    extraPhones: r.extraPhones,
    amount: r.amount,
    assigneeId: r.assigneeId,
    createdById: r.createdById,
    orderId: r.orderId,
    lostReason: r.lostReason,
    unsorted: r.unsorted,
    customFields: r.customFields,
    utm: r.utm ?? null,
    tags: r.tags,
    stageChangedAt: r.stageChangedAt,
    closedAt: r.closedAt,
  });
}

export class DrizzleDealRepository implements DealRepository {
  async nextIdentity() {
    const { rows } = await executor().execute<{ id: string; number: number }>(sql`select gen_random_uuid()::text as id, nextval(pg_get_serial_sequence('crm_deals', 'number'))::int as number`);
    return rows[0];
  }

  async findById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
    return r ? toDomain(r) : null;
  }

  async findByOrder(orderId: string) {
    return (await executor().select().from(crmDeals).where(eq(crmDeals.orderId, orderId))).map(toDomain);
  }

  async findOpen(opts: { clientId?: string | null; phone?: string | null }) {
    const key = phoneKey(opts.phone);
    const conds = [
      opts.clientId ? eq(crmDeals.clientId, opts.clientId) : undefined,
      key.length >= 10 ? sql`${phoneDigits(crmDeals.contactPhone)} = ${key}` : undefined,
      key.length >= 10 ? inExtra(crmDeals.extraPhones, key) : undefined,
    ].filter((c): c is SQL => !!c);
    if (!conds.length) return null;
    const [row] = await executor()
      .select({ deal: crmDeals })
      .from(crmDeals)
      .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
      .where(and(eq(crmStages.kind, "open"), or(...conds)))
      .orderBy(desc(crmDeals.updatedAt))
      .limit(1);
    return row ? toDomain(row.deal) : null;
  }

  private columns(deal: Deal) {
    const s = deal.snapshot();
    return {
      title: s.title,
      stageId: s.stageId,
      source: s.source,
      clientId: s.clientId,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      contactEmail: s.contactEmail,
      extraPhones: s.extraPhones,
      amount: s.amount,
      assigneeId: s.assigneeId,
      orderId: s.orderId,
      lostReason: s.lostReason,
      unsorted: s.unsorted,
      customFields: s.customFields,
      utm: s.utm,
      tags: s.tags,
      stageChangedAt: s.stageChangedAt,
      closedAt: s.closedAt,
    };
  }

  private async writeJournal(deal: Deal) {
    const { notes, stageChanges } = deal.pullJournal();
    if (stageChanges.length) await executor().insert(crmStageHistory).values(stageChanges.map((c) => ({ dealId: deal.id, ...c })));
    if (notes.length) await executor().insert(crmNotes).values(notes.map((n) => ({ dealId: deal.id, clientId: deal.clientId, authorId: n.authorId, kind: n.kind, text: n.text })));
  }

  async add(deal: Deal) {
    await executor()
      .insert(crmDeals)
      .values({ id: deal.id, number: deal.number, createdById: deal.snapshot().createdById, ...this.columns(deal) });
    await this.writeJournal(deal);
  }

  async save(deal: Deal) {
    await executor()
      .update(crmDeals)
      .set({ ...this.columns(deal), updatedAt: new Date() })
      .where(eq(crmDeals.id, deal.id));
    await this.writeJournal(deal);
  }

  async mergeInto(target: Deal, source: Deal) {
    const db = executor();
    await db.update(crmConversations).set({ dealId: target.id }).where(eq(crmConversations.dealId, source.id));
    await db.update(crmCalls).set({ dealId: target.id }).where(eq(crmCalls.dealId, source.id));
    await db.update(crmTasks).set({ dealId: target.id }).where(eq(crmTasks.dealId, source.id));
    await db.update(crmNotes).set({ dealId: target.id }).where(eq(crmNotes.dealId, source.id));
    await db.delete(crmDeals).where(eq(crmDeals.id, source.id));
  }

  async addNote(deal: { id: string; clientId: string | null }, text: string, authorId: string | null, kind: NoteKind) {
    await executor().insert(crmNotes).values({ clientId: deal.clientId, dealId: deal.id, authorId, kind, text });
  }
}

/** Воронки и этапы по порядку настроек. Справочник маленький — читаем целиком. */
export class DrizzleFunnelRepository implements FunnelRepository {
  async load() {
    const rows = await executor()
      .select({ s: crmStages })
      .from(crmStages)
      .innerJoin(crmPipelines, eq(crmPipelines.id, crmStages.pipelineId))
      .orderBy(asc(crmPipelines.position), asc(crmPipelines.createdAt), asc(crmStages.position), asc(crmStages.createdAt));
    return new Funnel(rows.map(({ s }): Stage => ({ id: s.id, pipelineId: s.pipelineId, name: s.name, kind: s.kind, position: s.position, milestone: s.milestone ?? null })));
  }
}

/** Read-модели продаж для страниц CRM. */
export class DrizzleSalesQueries {
  listPipelines() {
    return executor().select().from(crmPipelines).orderBy(asc(crmPipelines.position), asc(crmPipelines.createdAt));
  }

  /** Этапы: одной воронки или всех (по порядку воронок, затем этапов). */
  async listStages(pipelineId?: string) {
    const rows = await executor()
      .select({ s: crmStages })
      .from(crmStages)
      .innerJoin(crmPipelines, eq(crmPipelines.id, crmStages.pipelineId))
      .where(pipelineId ? eq(crmStages.pipelineId, pipelineId) : undefined)
      .orderBy(asc(crmPipelines.position), asc(crmPipelines.createdAt), asc(crmStages.position), asc(crmStages.createdAt));
    return rows.map((r) => r.s);
  }

  dealsByIds(ids: string[]) {
    return ids.length ? executor().select().from(crmDeals).where(inArray(crmDeals.id, ids)) : Promise.resolve([]);
  }

  /** Другие сделки того же человека: по клиенту, телефону (включая доп. номера) или e-mail. */
  async duplicates(deal: Pick<Row, "id" | "clientId" | "contactEmail" | "contactPhone" | "extraPhones">) {
    const keys = [deal.contactPhone, ...deal.extraPhones].map(phoneKey).filter((k) => k.length >= 10);
    const conds = [
      deal.clientId ? eq(crmDeals.clientId, deal.clientId) : undefined,
      deal.contactEmail ? sql`lower(${crmDeals.contactEmail}) = ${deal.contactEmail.toLowerCase()}` : undefined,
      ...keys.flatMap((k) => [sql`${phoneDigits(crmDeals.contactPhone)} = ${k}`, inExtra(crmDeals.extraPhones, k)]),
    ].filter((c): c is SQL => !!c);
    if (!conds.length) return [];
    return executor()
      .select({ deal: crmDeals, stage: crmStages })
      .from(crmDeals)
      .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
      .where(and(ne(crmDeals.id, deal.id), or(...conds)))
      .orderBy(desc(crmDeals.createdAt))
      .limit(10);
  }
}
