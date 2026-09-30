import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { crmAutomationRuns, crmAutomations, crmCalls, crmConversations, crmDeals, crmTasks, orders, users, type AutomationAction, type CrmAutomation } from "../db/schema";
import { env } from "../env";
import { adminLabel } from "../crm";
import { automationTriggers, fillTemplate, type AutomationTrigger } from "./automation-meta";
import { getSetting } from "./settings";
import { isWorkTime, parseWorkHours, workMinutesBetween } from "./schedule";
import { messagesFor } from "@/i18n/messages";
import { formatDate } from "../utils";
import { notify, staffWith } from "./notify";

export interface TriggerContext {
  /** Объект срабатывания: одно правило не выполняется дважды для одного subject. */
  subject: string;
  dealId?: string | null;
  clientId?: string | null;
  conversationId?: string | null;
  callId?: string | null;
  orderId?: string | null;
  stageId?: string | null;
  source?: string | null;
  channel?: string | null;
  /** Сейчас рабочее время отдела продаж (для условия «только в рабочее / вне рабочего»). */
  workTime?: boolean;
  /** Повод и дата — для повторных продаж. */
  occasion?: string | null;
  date?: string | null;
}

/** Защита от зацикливания: правило двигает сделку → срабатывает правило на этап → … */
const depth = new AsyncLocalStorage<number>();
const MAX_DEPTH = 3;

export async function runTrigger(trigger: AutomationTrigger, initial: TriggerContext) {
  let ctx = initial;
  const level = depth.getStore() ?? 0;
  if (level >= MAX_DEPTH) return;
  await depth.run(level + 1, async () => {
    let rules: CrmAutomation[];
    try {
      rules = await db.select().from(crmAutomations).where(and(eq(crmAutomations.trigger, trigger), eq(crmAutomations.active, true)));
    } catch (err) {
      console.error("[automations] load", err);
      return;
    }
    if (ctx.workTime === undefined && rules.some((r) => r.conditions?.hours === "work" || r.conditions?.hours === "off")) {
      ctx = { ...ctx, workTime: isWorkTime(new Date(), parseWorkHours(await getSetting("crm.workHours"))) };
    }
    for (const rule of rules) {
      if (!matches(rule, ctx)) continue;
      await execute(rule, ctx).catch((err) => console.error(`[automations] «${rule.name}»`, err));
    }
  });
}

/** Условия: этап, источник, канал, рабочее время. Пустое условие — подходит всё. */
export function matches(rule: Pick<CrmAutomation, "conditions">, ctx: TriggerContext) {
  const c = rule.conditions ?? {};
  if (c.hours === "work" && ctx.workTime === false) return false;
  if (c.hours === "off" && ctx.workTime !== false) return false;
  for (const key of ["stageId", "source", "channel"] as const) {
    const want = c[key];
    if (want && String(want) !== String(ctx[key] ?? "")) return false;
  }
  return true;
}

async function execute(rule: CrmAutomation, ctx: TriggerContext): Promise<boolean> {
  // Отметка о срабатывании до действий: при гонке двух вебхуков выполнит только один.
  const claimed = await db.insert(crmAutomationRuns).values({ automationId: rule.id, subject: ctx.subject.slice(0, 200) }).onConflictDoNothing().returning({ id: crmAutomationRuns.id });
  if (!claimed.length) return false;
  const loaded = await loadContext(ctx);
  for (const action of rule.actions ?? []) await runAction(rule, action, ctx, loaded);
  await db
    .update(crmAutomations)
    .set({ runs: sql`${crmAutomations.runs} + 1`, lastRunAt: new Date() })
    .where(eq(crmAutomations.id, rule.id));
  return true;
}

type Loaded = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(ctx: TriggerContext) {
  const deal = ctx.dealId ? await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, ctx.dealId) }) : undefined;
  const conv = ctx.conversationId ? await db.query.crmConversations.findFirst({ where: eq(crmConversations.id, ctx.conversationId) }) : undefined;
  const call = ctx.callId ? await db.query.crmCalls.findFirst({ where: eq(crmCalls.id, ctx.callId) }) : undefined;
  const orderId = ctx.orderId ?? deal?.orderId;
  const order = orderId ? await db.query.orders.findFirst({ where: eq(orders.id, orderId), columns: { number: true } }) : undefined;
  const clientId = ctx.clientId ?? deal?.clientId ?? conv?.clientId ?? call?.clientId ?? null;
  const client = clientId ? await db.query.users.findFirst({ where: eq(users.id, clientId), columns: { name: true, managerId: true } }) : undefined;
  return {
    deal,
    conv,
    call,
    order,
    clientId,
    name: deal?.contactName || conv?.contactName || client?.name || "",
    assigneeId: deal?.assigneeId ?? conv?.assigneeId ?? call?.staffId ?? client?.managerId ?? null,
  };
}

function linkFor(ctx: TriggerContext, e: Loaded) {
  // Для событий переписки полезнее сразу открыть чат, для остального — сделку.
  if (e.conv) return `/admin/chats?c=${e.conv.id}`;
  if (e.deal) return `/admin/deals/${e.deal.id}`;
  if (ctx.orderId) return `/admin/orders/${ctx.orderId}`;
  if (e.call) return "/admin/calls";
  if (e.clientId) return `/admin/clients/${e.clientId}`;
  return null;
}

async function managerName(id: string | null) {
  if (!id) return "";
  const u = await db.query.users.findFirst({ where: eq(users.id, id), columns: { name: true, email: true } });
  return u ? adminLabel(u) : "";
}

async function runAction(rule: CrmAutomation, a: AutomationAction, ctx: TriggerContext, e: Loaded) {
  const vars = { name: e.name, order: e.order?.number ?? null, link: env.appUrl, manager: await managerName(e.assigneeId), occasion: ctx.occasion ?? "", date: ctx.date ?? "" };
  switch (a.type) {
    case "create_task": {
      const assigneeId = a.userId || e.deal?.assigneeId || e.assigneeId;
      const title = fillTemplate(a.title || rule.name, vars) || rule.name;
      const kind = ctx.callId ? "call" : ctx.conversationId ? "message" : "task";
      await db.insert(crmTasks).values({
        title: title.slice(0, 200),
        kind,
        dueAt: new Date(Date.now() + (a.dueMinutes ?? 60) * 60_000),
        clientId: e.clientId,
        dealId: e.deal?.id ?? null,
        orderId: ctx.orderId ?? null,
        assigneeId,
      });
      await notify(assigneeId ? [assigneeId] : await staffWith("deals.view"), { kind: "task", title: `Задача: ${title}`, body: rule.name, link: linkFor(ctx, e) ?? "/admin/tasks" });
      return;
    }
    case "send_message": {
      const text = fillTemplate(a.text ?? "", vars);
      if (!text) return;
      const convId = e.conv?.id ?? (await latestConversation(e.deal?.id ?? null, e.clientId));
      if (!convId) return;
      const { sendChatMessage } = await import("./chats");
      await sendChatMessage(convId, text, null);
      return;
    }
    case "assign": {
      const { nextRoundRobin, assignDeal } = await import("./deals");
      const userId = a.userId || (await nextRoundRobin());
      if (!userId) return;
      if (e.deal && !e.deal.assigneeId) await assignDeal(e.deal.id, userId);
      if (e.conv && !e.conv.assigneeId) await db.update(crmConversations).set({ assigneeId: userId }).where(eq(crmConversations.id, e.conv.id));
      e.assigneeId = e.assigneeId ?? userId;
      return;
    }
    case "move_stage": {
      if (!e.deal || !a.stageId) return;
      const { moveDeal } = await import("./deals");
      await moveDeal(e.deal.id, a.stageId, null);
      return;
    }
    case "create_deal": {
      if (e.deal) return; // открытая сделка уже есть — работаем в ней
      const { createDeal, findOpenDeal } = await import("./deals");
      const open = e.clientId ? await findOpenDeal({ clientId: e.clientId }) : null;
      if (open) {
        e.deal = open;
        return;
      }
      if (!e.clientId) return;
      const client = await db.query.users.findFirst({ where: eq(users.id, e.clientId), columns: { name: true, email: true, phone: true, managerId: true } });
      if (!client) return;
      const deal = await createDeal({
        title: fillTemplate(a.title || rule.name, vars) || rule.name,
        source: rule.trigger === "occasion.anniversary" ? "repeat" : "manual",
        clientId: e.clientId,
        contactName: client.name,
        contactPhone: client.phone,
        contactEmail: client.email,
        assigneeId: a.userId || client.managerId || null,
      });
      e.deal = deal;
      e.assigneeId = e.assigneeId ?? deal.assigneeId;
      return;
    }
    case "notify": {
      const to = a.userId ? [a.userId] : e.assigneeId ? [e.assigneeId] : await staffWith("deals.view");
      const fallback = e.conv ? `${e.name || "Клиент"}: ${e.conv.lastMessageText}` : e.deal ? `№${e.deal.number} ${e.deal.title}` : rule.name;
      await notify(to, {
        kind: rule.trigger === "message.unanswered" ? "sla" : "system",
        title: fillTemplate(a.title || automationTriggers[rule.trigger as AutomationTrigger]?.label || rule.name, vars),
        body: a.text ? fillTemplate(a.text, vars) : fallback,
        link: linkFor(ctx, e),
      });
      return;
    }
  }
}

async function latestConversation(dealId: string | null, clientId: string | null) {
  const cond = dealId ? eq(crmConversations.dealId, dealId) : clientId ? eq(crmConversations.clientId, clientId) : null;
  if (!cond) return null;
  const [c] = await db.select({ id: crmConversations.id }).from(crmConversations).where(cond).orderBy(desc(crmConversations.lastMessageAt)).limit(1);
  return c?.id ?? null;
}

let lastSlowRun = 0;

/**
 * Правила по времени. «Клиенту не ответили N минут» — каждую минуту, считая только рабочее время;
 * «клиент забросил книгу» и «годовщина повода» — раз в 30 минут (force — сразу, для scheduler:once).
 */
export async function runScheduledAutomations(opts: { force?: boolean } = {}) {
  const rules = await db.select().from(crmAutomations).where(eq(crmAutomations.active, true));
  if (!rules.length) return 0;
  const hours = parseWorkHours(await getSetting("crm.workHours"));
  const now = new Date();
  const workTime = isWorkTime(now, hours);
  let fired = 0;
  const run = async (rule: CrmAutomation, ctx: TriggerContext) => {
    if (!matches(rule, ctx)) return;
    const ok = await depth.run(1, () => execute(rule, ctx)).catch((err) => {
      console.error(`[automations] «${rule.name}»`, err);
      return false;
    });
    if (ok) fired++;
  };

  for (const rule of rules.filter((r) => r.trigger === "message.unanswered")) {
    const minutes = Math.max(1, Number(rule.conditions?.minutes ?? 15) || 15);
    const convs = await db
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.status, "open"), isNotNull(crmConversations.awaitingSince), lte(crmConversations.awaitingSince, new Date(now.getTime() - minutes * 60_000))))
      .limit(200);
    for (const c of convs) {
      // Ночь и выходные не считаем: норматив — в рабочих минутах.
      if (workMinutesBetween(c.awaitingSince!, now, hours) < minutes) continue;
      await run(rule, { subject: `${c.id}:${c.awaitingSince!.toISOString()}`, conversationId: c.id, dealId: c.dealId, clientId: c.clientId, channel: c.channel, workTime });
    }
  }

  if (!opts.force && Date.now() - lastSlowRun < 30 * 60_000) return fired;
  lastSlowRun = Date.now();

  for (const rule of rules.filter((r) => r.trigger === "client.inactive")) {
    const days = Math.max(1, Number(rule.conditions?.days ?? 5) || 5);
    const rows = await db.execute<{ deal_id: string; client_id: string; last_seen: Date | string }>(sql`
      select d.id as deal_id, d.client_id, coalesce(u.last_seen_at, u.created_at) as last_seen
      from crm_deals d
      join crm_stages s on s.id = d.stage_id and s.kind = 'open'
      join users u on u.id = d.client_id
      where coalesce(u.last_seen_at, u.created_at) < now() - make_interval(days => ${days})
        and exists (select 1 from books b where b.user_id = u.id and b.status = 'draft')
        and not exists (select 1 from orders o where o.user_id = u.id and o.status <> 'cancelled' and o.created_at > coalesce(u.last_seen_at, u.created_at))
      limit 200`);
    for (const r of rows.rows) {
      await run(rule, { subject: `${r.deal_id}:${new Date(r.last_seen).toISOString()}`, dealId: r.deal_id, clientId: r.client_id, workTime });
    }
  }

  for (const rule of rules.filter((r) => r.trigger === "occasion.anniversary")) {
    const before = Math.min(120, Math.max(1, Number(rule.conditions?.daysBefore ?? 30) || 30));
    // Ближайшая годовщина даты повода (или желаемой даты заказа), до которой осталось не больше N дней.
    const rows = await db.execute<{ order_id: string; client_id: string; occasion: string | null; next_date: string; year: number }>(sql`
      with base as (
        select o.id as order_id, o.user_id as client_id, b.occasion, coalesce(b.occasion_date, o.desired_date)::date as d
        from orders o join books b on b.id = o.book_id
        where o.paid_at is not null and o.status <> 'cancelled' and coalesce(b.occasion_date, o.desired_date) is not null
          and coalesce(b.occasion, '') <> 'graduation'
      ), nxt as (
        select *, (d + make_interval(years => extract(year from current_date)::int - extract(year from d)::int))::date as this_year from base
      ), nxt2 as (
        select *, case when this_year < current_date then (this_year + interval '1 year')::date else this_year end as next_date from nxt
      )
      select order_id, client_id, occasion, to_char(next_date, 'YYYY-MM-DD') as next_date, extract(year from next_date)::int as year
      from nxt2 where next_date > d and next_date - current_date between 0 and ${before}
      limit 200`);
    for (const r of rows.rows) {
      const label = r.occasion ? (messagesFor("ru").common.occasions as Record<string, { label: string }>)[r.occasion]?.label ?? "" : "";
      await run(rule, { subject: `${r.order_id}:${r.year}`, orderId: r.order_id, clientId: r.client_id, workTime, occasion: label || "памятная дата", date: formatDate(r.next_date) });
    }
  }
  return fired;
}
