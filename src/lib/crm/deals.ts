import { usersId } from "../db/refs";
import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  crmCalls,
  crmConversations,
  crmDeals,
  crmNotes,
  crmPipelines,
  crmRoles,
  crmStageHistory,
  crmStages,
  crmTasks,
  orders,
  users,
  type CrmDeal,
  type CrmPipeline,
  type CrmStage,
  type CustomValues,
  type DealSource,
  type Order,
} from "../db/schema";
import { normalizePhone, phoneKey } from "./phone";
import { toAttribution, type Attribution } from "./channels";
import { getSetting } from "./settings";
import { isWorkTime, parseWorkHours } from "./schedule";
import { BOOK_READY_ANSWERS, milestoneOrder, type StageMilestone } from "./deal-meta";
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

export async function listPipelines(): Promise<CrmPipeline[]> {
  return db.select().from(crmPipelines).orderBy(asc(crmPipelines.position), asc(crmPipelines.createdAt));
}

/** Основная воронка — первая по порядку: в неё попадают заявки с сайта, из чатов и звонков. */
export async function defaultPipelineId(): Promise<string> {
  const [p] = await db.select({ id: crmPipelines.id }).from(crmPipelines).orderBy(asc(crmPipelines.position), asc(crmPipelines.createdAt)).limit(1);
  if (!p) throw new Error("Нет ни одной воронки");
  return p.id;
}

/** Этапы: одной воронки или всех (по порядку воронок, затем этапов). */
export async function listStages(pipelineId?: string): Promise<CrmStage[]> {
  return db
    .select({ s: crmStages })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmPipelines.id, crmStages.pipelineId))
    .where(pipelineId ? eq(crmStages.pipelineId, pipelineId) : undefined)
    .orderBy(asc(crmPipelines.position), asc(crmPipelines.createdAt), asc(crmStages.position), asc(crmStages.createdAt))
    .then((rows) => rows.map((r) => r.s));
}

export async function stageOfKind(kind: CrmStage["kind"], pipelineId?: string) {
  const pid = pipelineId ?? (await defaultPipelineId());
  const [s] = await db
    .select()
    .from(crmStages)
    .where(and(eq(crmStages.kind, kind), eq(crmStages.pipelineId, pid)))
    .orderBy(asc(crmStages.position))
    .limit(1);
  return s ?? null;
}

async function firstStage(pipelineId?: string) {
  const s = await stageOfKind("open", pipelineId);
  if (!s) throw new Error("В воронке нет ни одного открытого этапа");
  return s;
}

async function logStage(dealId: string, fromStageId: string | null, toStageId: string, actorId: string | null) {
  await db.insert(crmStageHistory).values({ dealId, fromStageId, toStageId, actorId });
}

const phoneDigits = (col: unknown) => sql`right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`;
/** Номер среди дополнительных телефонов (хранятся нормализованными цифрами). */
const inExtra = (col: unknown, key: string) => sql`exists (select 1 from unnest(${col}) p where right(p, 10) = ${key})`;

/** Клиент по телефону: из профиля или из контактов его заказов. */
export async function findClientByPhone(phone: string | null | undefined): Promise<string | null> {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "user"), or(sql`${phoneDigits(users.phone)} = ${key}`, inExtra(users.extraPhones, key))))
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
  const conds = [
    opts.clientId ? eq(crmDeals.clientId, opts.clientId) : undefined,
    key.length >= 10 ? sql`${phoneDigits(crmDeals.contactPhone)} = ${key}` : undefined,
    key.length >= 10 ? inExtra(crmDeals.extraPhones, key) : undefined,
  ].filter(Boolean);
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
  // Вне рабочего времени заявку не отдаём никому: утром её возьмёт первый, кто выйдет на смену.
  if (!isWorkTime(new Date(), parseWorkHours(await getSetting("crm.workHours")))) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(crmRoles, eq(crmRoles.id, users.crmRoleId))
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), eq(users.onShift, true), ne(crmRoles.key, "owner"), sql`'deals.edit' = any(${crmRoles.permissions})`))
    .orderBy(sql`(select max(d.created_at) from crm_deals d where d.assignee_id = ${usersId}) asc nulls first`, asc(users.createdAt))
    .limit(1);
  // Роль без ключа (своя) тоже подходит: ne(key,'owner') отсекает null, поэтому проверяем её отдельно.
  if (row) return row.id;
  const [custom] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(crmRoles, eq(crmRoles.id, users.crmRoleId))
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), eq(users.onShift, true), isNull(crmRoles.key), sql`'deals.edit' = any(${crmRoles.permissions})`))
    .orderBy(sql`(select max(d.created_at) from crm_deals d where d.assignee_id = ${usersId}) asc nulls first`)
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
  /** Заявка с нового контакта: попадёт в «Неразобранное» (если оно включено в настройках). */
  unsorted?: boolean;
  pipelineId?: string;
  customFields?: CustomValues;
  /** Откуда пришёл (UTM). Для клиента с сайта берётся из его профиля, если не передано. */
  utm?: Attribution | null;
}

export async function createDeal(input: NewDeal): Promise<CrmDeal> {
  const stageId = input.stageId ?? (await firstStage(input.pipelineId)).id;
  let clientId = input.clientId ?? null;
  if (!clientId && input.contactPhone) clientId = await findClientByPhone(input.contactPhone);
  const unsorted = !!input.unsorted && !clientId && (await getSetting("crm.unsorted")) !== "off";
  let utm = input.utm ?? null;
  if (!utm && clientId) utm = toAttribution((await db.query.users.findFirst({ where: eq(users.id, clientId), columns: { source: true } }))?.source);
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
      unsorted,
      customFields: input.customFields ?? {},
      utm: utm as Record<string, string> | null,
    })
    .returning();
  await logStage(deal.id, null, stageId, input.createdById ?? null);
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
    .set({
      stageId,
      stageChangedAt: new Date(),
      closedAt: closed ? new Date() : null,
      lostReason: stage.kind === "lost" ? (lostReason ?? deal.lostReason) : null,
      unsorted: false,
      updatedAt: new Date(),
    })
    .where(eq(crmDeals.id, dealId))
    .returning();
  await logStage(dealId, deal.stageId, stageId, actorId);
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

/**
 * Воронка по действиям клиента на сайте. Сделка идёт только вперёд: на этап, у которого задан этот milestone,
 * если он дальше текущего. Закрытые сделки не трогаем. Сделку заводим сами, начиная с настройки crm.autoDealFrom.
 */
export async function advanceByMilestone(clientId: string, milestone: StageMilestone, opts: { title?: string; orderId?: string | null; amount?: number; customFields?: CustomValues } = {}) {
  try {
    const stages = await listStages();
    let deal = await findOpenDeal({ clientId });
    // Этап-цель ищем в воронке сделки; новая сделка с сайта — в основной воронке.
    const pipelineId = deal ? stages.find((st) => st.id === deal!.stageId)?.pipelineId : await defaultPipelineId();
    const target = stages.find((st) => st.milestone === milestone && st.pipelineId === pipelineId);
    if (!deal) {
      const from = (await getSetting("crm.autoDealFrom")) as StageMilestone | "off";
      // Заказ заводит сделку всегда: продажа должна попасть в воронку и аналитику.
      const create = milestone === "order_created" || milestone === "order_paid" || (from !== "off" && milestoneOrder.indexOf(milestone) >= milestoneOrder.indexOf(from));
      if (!create) return null;
      const client = await db.query.users.findFirst({ where: eq(users.id, clientId), columns: { name: true, email: true, phone: true } });
      if (!client) return null;
      deal = await createDeal({
        title: opts.title ?? `Сайт: ${client.name || client.email.split("@")[0]}`,
        source: "site",
        clientId,
        contactName: client.name,
        contactPhone: client.phone ? normalizePhone(client.phone) : null,
        contactEmail: client.email,
        amount: opts.amount ?? 0,
        orderId: opts.orderId ?? null,
        stageId: target?.id,
        customFields: opts.customFields,
      });
    } else if (opts.orderId || opts.amount) {
      await db
        .update(crmDeals)
        .set({ ...(opts.orderId ? { orderId: opts.orderId } : {}), ...(opts.amount ? { amount: opts.amount } : {}), updatedAt: new Date() })
        .where(eq(crmDeals.id, deal.id));
    }
    if (!target) return deal;
    const current = stages.find((st) => st.id === deal!.stageId);
    if (!current || current.kind !== "open" || deal.stageId === target.id) return deal;
    if (target.kind === "open" && target.position <= current.position) return deal;
    return await moveDeal(deal.id, target.id, null);
  } catch (err) {
    console.error("[crm] advanceByMilestone", milestone, err);
    return null;
  }
}

/** Прогресс книги → milestones «половина» и «почти готова». Вызывается после сохранения ответа. */
const reached = new Map<string, Set<StageMilestone>>();
export async function onBookProgress(bookId: string, userId: string) {
  const seen = reached.get(bookId) ?? new Set();
  if (seen.has("book_ready")) return;
  const [row] = await db.execute<{ answered: number; total: number }>(sql`
    select count(*) filter (where length(trim(answer)) > 0)::int as answered, count(*)::int as total
    from book_questions where book_id = ${bookId}`).then((r) => r.rows);
  if (!row) return;
  if (!seen.has("book_half") && row.total && row.answered * 2 >= row.total) {
    seen.add("book_half");
    await advanceByMilestone(userId, "book_half");
  }
  if (row.answered >= BOOK_READY_ANSWERS) {
    seen.add("book_ready");
    await advanceByMilestone(userId, "book_ready");
  }
  if (reached.size > 5000) reached.clear();
  reached.set(bookId, seen);
}

/** Новый заказ с сайта: связываем с открытой сделкой клиента (или заводим её) и двигаем по воронке. */
export async function onOrderCreated(order: Order) {
  await advanceByMilestone(order.userId, "order_created", { title: `Заказ №${order.number}`, orderId: order.id, amount: order.amount });
  await runTrigger("order.created", { subject: order.id, orderId: order.id, clientId: order.userId }).catch((err) => console.error("[crm] order.created", err));
}

export async function onOrderPaid(order: Order) {
  try {
    await db.update(crmDeals).set({ amount: order.amount, updatedAt: new Date() }).where(eq(crmDeals.orderId, order.id));
    const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.orderId, order.id) });
    if (deal) await advanceByMilestone(order.userId, "order_paid");
    await runTrigger("order.paid", { subject: order.id, orderId: order.id, clientId: order.userId, dealId: deal?.id });
  } catch (err) {
    console.error("[crm] onOrderPaid", err);
  }
}

export async function onOrderCancelled(order: Order) {
  try {
    const deals = await db.select({ id: crmDeals.id, pipelineId: crmStages.pipelineId }).from(crmDeals).innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId)).where(eq(crmDeals.orderId, order.id));
    for (const d of deals) {
      const lost = await stageOfKind("lost", d.pipelineId);
      if (lost) await moveDeal(d.id, lost.id, null, "Заказ отменён");
    }
  } catch (err) {
    console.error("[crm] onOrderCancelled", err);
  }
}

export async function dealsByIds(ids: string[]) {
  return ids.length ? db.select().from(crmDeals).where(inArray(crmDeals.id, ids)) : [];
}

// ─── дубли ─────────────────────────────────────────────────────────────────

/** Другие сделки того же человека: по клиенту, телефону (включая доп. номера) или e-mail. */
export async function findDuplicateDeals(deal: CrmDeal) {
  const keys = [deal.contactPhone, ...deal.extraPhones].map(phoneKey).filter((k) => k.length >= 10);
  const conds = [
    deal.clientId ? eq(crmDeals.clientId, deal.clientId) : undefined,
    deal.contactEmail ? sql`lower(${crmDeals.contactEmail}) = ${deal.contactEmail.toLowerCase()}` : undefined,
    ...keys.flatMap((k) => [sql`${phoneDigits(crmDeals.contactPhone)} = ${k}`, inExtra(crmDeals.extraPhones, k)]),
  ].filter(Boolean);
  if (!conds.length) return [];
  return db
    .select({ deal: crmDeals, stage: crmStages })
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(and(ne(crmDeals.id, deal.id), or(...conds)))
    .orderBy(desc(crmDeals.createdAt))
    .limit(10);
}

/**
 * Слияние: всё из source (переписка, звонки, задачи, история) переносится в target, пустые поля target
 * заполняются из source, телефон source становится дополнительным. Source удаляется.
 */
export async function mergeDeals(targetId: string, sourceId: string, actorId: string | null) {
  return db.transaction(async (tx) => {
    const target = await tx.query.crmDeals.findFirst({ where: eq(crmDeals.id, targetId) });
    const source = await tx.query.crmDeals.findFirst({ where: eq(crmDeals.id, sourceId) });
    if (!target || !source || target.id === source.id) throw new Error("Сделка не найдена");
    const phones = new Set([...target.extraPhones, ...source.extraPhones]);
    if (source.contactPhone && target.contactPhone && phoneKey(source.contactPhone) !== phoneKey(target.contactPhone)) phones.add(normalizePhone(source.contactPhone));
    if (target.contactPhone) phones.delete(normalizePhone(target.contactPhone));
    await tx.update(crmConversations).set({ dealId: target.id }).where(eq(crmConversations.dealId, source.id));
    await tx.update(crmCalls).set({ dealId: target.id }).where(eq(crmCalls.dealId, source.id));
    await tx.update(crmTasks).set({ dealId: target.id }).where(eq(crmTasks.dealId, source.id));
    await tx.update(crmNotes).set({ dealId: target.id }).where(eq(crmNotes.dealId, source.id));
    await tx
      .update(crmDeals)
      .set({
        contactName: target.contactName || source.contactName,
        contactPhone: target.contactPhone ?? source.contactPhone,
        contactEmail: target.contactEmail ?? source.contactEmail,
        clientId: target.clientId ?? source.clientId,
        orderId: target.orderId ?? source.orderId,
        assigneeId: target.assigneeId ?? source.assigneeId,
        amount: target.amount || source.amount,
        tags: [...new Set([...target.tags, ...source.tags])],
        extraPhones: [...phones],
        unsorted: false,
        updatedAt: new Date(),
      })
      .where(eq(crmDeals.id, target.id));
    await tx.delete(crmDeals).where(eq(crmDeals.id, source.id));
    await tx.insert(crmNotes).values({ clientId: target.clientId ?? source.clientId, dealId: target.id, authorId: actorId, kind: "system", text: `Объединена со сделкой №${source.number} «${source.title}»` });
    return { target, source };
  });
}

/** Заполнить пустые свои поля сделки (не перетирая то, что менеджер уже ввёл). */
export async function fillEmptyFields(dealId: string, values: CustomValues) {
  const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, dealId), columns: { customFields: true } });
  if (!deal) return;
  const next = { ...deal.customFields };
  let changed = false;
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === "" || (next[k] !== undefined && next[k] !== null && next[k] !== "")) continue;
    next[k] = v;
    changed = true;
  }
  if (changed) await db.update(crmDeals).set({ customFields: next }).where(eq(crmDeals.id, dealId));
}
