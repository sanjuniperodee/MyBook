import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { crmDeals, crmNotes, crmRoles, crmStages, orders, users, type CrmDeal, type CrmStage, type DealSource, type Order } from "../db/schema";
import { phoneKey } from "./phone";
import { notify } from "./notify";
import { runTrigger } from "./automations";

export { dealSourceLabels } from "./deal-meta";
import { dealSourceLabels } from "./deal-meta";

/** Канал мессенджера (chatType Wazzup) → источник сделки. */
export function sourceFromChannel(channel: string): DealSource {
  if (channel.startsWith("whatsapp") || channel === "wapi") return "whatsapp";
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("telegram") || channel === "tgapi") return "telegram";
  return "manual";
}

export async function listStages(): Promise<CrmStage[]> {
  return db.select().from(crmStages).orderBy(asc(crmStages.position), asc(crmStages.createdAt));
}

export async function stageOfKind(kind: CrmStage["kind"]) {
  const [s] = await db.select().from(crmStages).where(eq(crmStages.kind, kind)).orderBy(asc(crmStages.position)).limit(1);
  return s ?? null;
}

async function firstStage() {
  const s = await stageOfKind("open");
  if (!s) throw new Error("В воронке нет ни одного открытого этапа");
  return s;
}

const phoneDigits = (col: unknown) => sql`right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`;

/** Клиент по телефону: из профиля или из контактов его заказов. */
export async function findClientByPhone(phone: string | null | undefined): Promise<string | null> {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "user"), sql`${phoneDigits(users.phone)} = ${key}`))
    .limit(1);
  if (u) return u.id;
  const [o] = await db
    .select({ id: orders.userId })
    .from(orders)
    .where(sql`${phoneDigits(orders.contactPhone)} = ${key}`)
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return o?.id ?? null;
}

/** Открытая (не закрытая) сделка клиента или номера — чтобы не плодить дубли. */
export async function findOpenDeal(opts: { clientId?: string | null; phone?: string | null }): Promise<CrmDeal | null> {
  const key = phoneKey(opts.phone);
  const conds = [opts.clientId ? eq(crmDeals.clientId, opts.clientId) : undefined, key.length >= 10 ? sql`${phoneDigits(crmDeals.contactPhone)} = ${key}` : undefined].filter(Boolean);
  if (!conds.length) return null;
  const [row] = await db
    .select({ deal: crmDeals })
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(and(eq(crmStages.kind, "open"), or(...conds)))
    .orderBy(desc(crmDeals.updatedAt))
    .limit(1);
  return row?.deal ?? null;
}

/**
 * Следующий менеджер по кругу: активный сотрудник с правом deals.edit (не руководитель),
 * которому дольше всех не доставалась новая сделка.
 */
export async function nextRoundRobin(): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(crmRoles, eq(crmRoles.id, users.crmRoleId))
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), ne(crmRoles.key, "owner"), sql`'deals.edit' = any(${crmRoles.permissions})`))
    .orderBy(sql`(select max(d.created_at) from crm_deals d where d.assignee_id = ${users.id}) asc nulls first`, asc(users.createdAt))
    .limit(1);
  // Роль без ключа (своя) тоже подходит: ne(key,'owner') отсекает null, поэтому проверяем её отдельно.
  if (row) return row.id;
  const [custom] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(crmRoles, eq(crmRoles.id, users.crmRoleId))
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), isNull(crmRoles.key), sql`'deals.edit' = any(${crmRoles.permissions})`))
    .orderBy(sql`(select max(d.created_at) from crm_deals d where d.assignee_id = ${users.id}) asc nulls first`)
    .limit(1);
  return custom?.id ?? null;
}

export async function addDealNote(deal: Pick<CrmDeal, "id" | "clientId">, text: string, authorId: string | null, kind: "note" | "call" | "message" | "system" = "system") {
  await db.insert(crmNotes).values({ clientId: deal.clientId, dealId: deal.id, authorId, kind, text });
}

export interface NewDeal {
  title: string;
  source: DealSource;
  clientId?: string | null;
  contactName?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  amount?: number;
  assigneeId?: string | null;
  createdById?: string | null;
  orderId?: string | null;
  stageId?: string;
}

export async function createDeal(input: NewDeal): Promise<CrmDeal> {
  const stageId = input.stageId ?? (await firstStage()).id;
  let clientId = input.clientId ?? null;
  if (!clientId && input.contactPhone) clientId = await findClientByPhone(input.contactPhone);
  // Ответственный клиента становится ответственным за сделку.
  let assigneeId = input.assigneeId ?? null;
  if (!assigneeId && clientId) assigneeId = (await db.query.users.findFirst({ where: eq(users.id, clientId), columns: { managerId: true } }))?.managerId ?? null;
  const [deal] = await db
    .insert(crmDeals)
    .values({
      title: input.title.slice(0, 200),
      stageId,
      source: input.source,
      clientId,
      contactName: (input.contactName ?? "").slice(0, 120),
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      amount: input.amount ?? 0,
      assigneeId,
      createdById: input.createdById ?? null,
      orderId: input.orderId ?? null,
    })
    .returning();
  await addDealNote(deal, `Создана сделка №${deal.number} «${deal.title}» (${dealSourceLabels[deal.source]})`, input.createdById ?? null);
  await runTrigger("deal.created", { subject: deal.id, dealId: deal.id, clientId, source: deal.source, stageId });
  const fresh = (await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, deal.id) })) ?? deal;
  if (fresh.assigneeId && fresh.assigneeId !== input.createdById)
    await notify([fresh.assigneeId], { kind: "deal", title: `Новая сделка №${fresh.number}`, body: fresh.title, link: `/admin/deals/${fresh.id}` });
  return fresh;
}

/** Смена этапа. Закрытые этапы (успех/отказ) ставят дату закрытия; возврат в работу её снимает. */
export async function moveDeal(dealId: string, stageId: string, actorId: string | null, lostReason?: string | null) {
  const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, dealId) });
  const stage = await db.query.crmStages.findFirst({ where: eq(crmStages.id, stageId) });
  if (!deal || !stage || deal.stageId === stageId) return deal ?? null;
  const closed = stage.kind !== "open";
  const [updated] = await db
    .update(crmDeals)
    .set({ stageId, stageChangedAt: new Date(), closedAt: closed ? new Date() : null, lostReason: stage.kind === "lost" ? (lostReason ?? deal.lostReason) : null, updatedAt: new Date() })
    .where(eq(crmDeals.id, dealId))
    .returning();
  await addDealNote(updated, `Сделка №${deal.number}: этап «${stage.name}»${stage.kind === "lost" && lostReason ? ` — ${lostReason}` : ""}`, actorId);
  await runTrigger("deal.stage_changed", { subject: `${dealId}:${stageId}:${Date.now()}`, dealId, clientId: updated.clientId, stageId, source: updated.source });
  return updated;
}

export async function assignDeal(dealId: string, assigneeId: string | null) {
  const [d] = await db.update(crmDeals).set({ assigneeId, updatedAt: new Date() }).where(eq(crmDeals.id, dealId)).returning();
  if (d?.clientId && assigneeId) await db.update(users).set({ managerId: assigneeId }).where(and(eq(users.id, d.clientId), isNull(users.managerId)));
  return d;
}

// ─── связь с заказами ──────────────────────────────────────────────────────

/** Новый заказ с сайта: привязываем к открытой сделке клиента (или создаём) и переводим в «успех». */
export async function onOrderCreated(order: Order) {
  try {
    const won = await stageOfKind("won");
    const existing = await findOpenDeal({ clientId: order.userId, phone: order.contactPhone });
    if (existing) {
      await db.update(crmDeals).set({ orderId: order.id, amount: order.amount, updatedAt: new Date() }).where(eq(crmDeals.id, existing.id));
      if (won) await moveDeal(existing.id, won.id, null);
    } else {
      await createDeal({
        title: `Заказ №${order.number}`,
        source: "site",
        clientId: order.userId,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
        contactEmail: order.contactEmail,
        amount: order.amount,
        orderId: order.id,
        stageId: won?.id,
      });
    }
    await runTrigger("order.created", { subject: order.id, orderId: order.id, clientId: order.userId });
  } catch (err) {
    console.error("[crm] onOrderCreated", err);
  }
}

export async function onOrderPaid(order: Order) {
  try {
    await db.update(crmDeals).set({ amount: order.amount, updatedAt: new Date() }).where(eq(crmDeals.orderId, order.id));
    const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.orderId, order.id) });
    await runTrigger("order.paid", { subject: order.id, orderId: order.id, clientId: order.userId, dealId: deal?.id });
  } catch (err) {
    console.error("[crm] onOrderPaid", err);
  }
}

export async function onOrderCancelled(order: Order) {
  try {
    const lost = await stageOfKind("lost");
    const deals = await db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.orderId, order.id));
    if (lost) for (const d of deals) await moveDeal(d.id, lost.id, null, "Заказ отменён");
  } catch (err) {
    console.error("[crm] onOrderCancelled", err);
  }
}

export async function dealsByIds(ids: string[]) {
  return ids.length ? db.select().from(crmDeals).where(inArray(crmDeals.id, ids)) : [];
}
