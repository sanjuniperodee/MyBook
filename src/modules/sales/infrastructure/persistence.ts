import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { crmCalls, crmConversations, crmDeals, crmNotes, crmPipelines, crmPlans, crmSavedViews, crmStageHistory, crmStages, crmTasks } from "@/lib/db/schema";
import { phoneKey } from "@/lib/crm/phone";
import { executor } from "@/shared/infrastructure/database";
import type { PipelineRepository } from "../application";
import { Deal, Funnel, type DealRepository, type FunnelRepository, type NoteKind, type PlanProgress, type Stage, type StageMilestone } from "../domain";

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

  async delete(dealId: string) {
    await executor().delete(crmDeals).where(eq(crmDeals.id, dealId));
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

  /** План и факт за месяц (по Алматы) по сотрудникам. */
  async planProgress(month: string, userIds?: string[]): Promise<Map<string, PlanProgress>> {
    const [plans, facts] = await Promise.all([
      executor()
        .select()
        .from(crmPlans)
        .where(and(eq(crmPlans.month, month), userIds ? inArray(crmPlans.userId, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]) : undefined)),
      executor().execute<{ user_id: string; amount: number; deals: number }>(sql`
        select d.assignee_id as user_id, coalesce(sum(d.amount), 0)::int as amount, count(*)::int as deals
        from crm_deals d join crm_stages s on s.id = d.stage_id
        where s.kind = 'won' and d.assignee_id is not null
          and to_char(d.closed_at at time zone 'Asia/Almaty', 'YYYY-MM') = ${month}
        group by d.assignee_id`),
    ]);
    const out = new Map<string, PlanProgress>();
    const get = (id: string) => out.get(id) ?? out.set(id, { userId: id, planAmount: 0, planDeals: 0, factAmount: 0, factDeals: 0 }).get(id)!;
    for (const p of plans) Object.assign(get(p.userId), { planAmount: p.amount, planDeals: p.deals });
    for (const f of facts.rows) if (!userIds || userIds.includes(f.user_id)) Object.assign(get(f.user_id), { factAmount: f.amount, factDeals: f.deals });
    return out;
  }
}

/** Воронки и этапы — настройки CRM. */
export class DrizzlePipelineRepository implements PipelineRepository {
  async stage(id: string) {
    const [s] = await executor().select().from(crmStages).where(eq(crmStages.id, id)).limit(1);
    return s ?? null;
  }
  stages(pipelineId: string) {
    return executor().select({ id: crmStages.id, kind: crmStages.kind, position: crmStages.position }).from(crmStages).where(eq(crmStages.pipelineId, pipelineId)).orderBy(asc(crmStages.position));
  }
  async dealsOnStage(stageId: string) {
    const [{ n }] = await executor().select({ n: sql<number>`count(*)::int` }).from(crmDeals).where(eq(crmDeals.stageId, stageId));
    return n;
  }
  async dealsInPipeline(pipelineId: string) {
    const [{ n }] = await executor().select({ n: sql<number>`count(*)::int` }).from(crmDeals).innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId)).where(eq(crmStages.pipelineId, pipelineId));
    return n;
  }
  async releaseMilestone(pipelineId: string, milestone: StageMilestone, exceptStageId: string | null) {
    await executor()
      .update(crmStages)
      .set({ milestone: null })
      .where(and(eq(crmStages.milestone, milestone), eq(crmStages.pipelineId, pipelineId), exceptStageId ? ne(crmStages.id, exceptStageId) : undefined));
  }
  async updateStage(id: string, patch: { name: string; color: string; milestone: StageMilestone | null }) {
    await executor().update(crmStages).set({ ...patch, updatedAt: new Date() }).where(eq(crmStages.id, id));
  }
  async insertOpenStage(pipelineId: string, stage: { name: string; color: string; milestone: StageMilestone | null }) {
    const db = executor();
    const [{ pos }] = await db
      .select({ pos: sql<number>`coalesce(max(${crmStages.position}) filter (where ${crmStages.kind} = 'open'), 0)::int` })
      .from(crmStages)
      .where(eq(crmStages.pipelineId, pipelineId));
    await db
      .update(crmStages)
      .set({ position: sql`${crmStages.position} + 1` })
      .where(and(eq(crmStages.pipelineId, pipelineId), sql`${crmStages.position} > ${pos}`));
    await db.insert(crmStages).values({ ...stage, position: pos + 1, kind: "open", pipelineId });
  }
  async swapPositions(a: { id: string; position: number }, b: { id: string; position: number }) {
    await executor().update(crmStages).set({ position: b.position }).where(eq(crmStages.id, a.id));
    await executor().update(crmStages).set({ position: a.position }).where(eq(crmStages.id, b.id));
  }
  async deleteStage(id: string) {
    await executor().delete(crmStages).where(eq(crmStages.id, id));
  }
  async createPipeline(name: string, stages: { name: string; color: string; kind: "open" | "won" | "lost" }[]) {
    const db = executor();
    const [{ pos }] = await db.select({ pos: sql<number>`coalesce(max(${crmPipelines.position}), 0)::int` }).from(crmPipelines);
    const [p] = await db.insert(crmPipelines).values({ name, position: pos + 1 }).returning();
    await db.insert(crmStages).values(stages.map((s, i) => ({ ...s, pipelineId: p.id, position: i + 1 })));
    return { id: p.id, name: p.name };
  }
  async renamePipeline(id: string, name: string) {
    await executor().update(crmPipelines).set({ name, updatedAt: new Date() }).where(eq(crmPipelines.id, id));
  }
  async deletePipeline(id: string) {
    await executor().delete(crmPipelines).where(eq(crmPipelines.id, id));
  }
}

/** Сохранённые фильтры списка сделок. */
export class DrizzleSavedViews {
  async add(view: { userId: string; name: string; query: string; shared: boolean }) {
    await executor().insert(crmSavedViews).values({ ...view, entity: "deals" });
  }
  async find(id: string) {
    const [v] = await executor().select().from(crmSavedViews).where(eq(crmSavedViews.id, id)).limit(1);
    return v ?? null;
  }
  async delete(id: string) {
    await executor().delete(crmSavedViews).where(eq(crmSavedViews.id, id));
  }
}

/** План продаж сотрудника на месяц. */
export const drizzlePlans = {
  async save(userId: string, month: string, amount: number, deals: number) {
    await executor()
      .insert(crmPlans)
      .values({ userId, month, amount, deals })
      .onConflictDoUpdate({ target: [crmPlans.userId, crmPlans.month], set: { amount, deals, updatedAt: new Date() } });
  },
};
