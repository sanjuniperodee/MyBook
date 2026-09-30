import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { crmAutomationRuns, crmAutomations, crmCalls, crmConversations, crmDeals, crmTasks, orders, users, type AutomationAction, type CrmAutomation } from "../db/schema";
import { env } from "../env";
import { adminLabel } from "../crm";
import { automationTriggers, fillTemplate, type AutomationTrigger } from "./automation-meta";
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
}

/** Защита от зацикливания: правило двигает сделку → срабатывает правило на этап → … */
const depth = new AsyncLocalStorage<number>();
const MAX_DEPTH = 3;

export async function runTrigger(trigger: AutomationTrigger, ctx: TriggerContext) {
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
    for (const rule of rules) {
      if (!matches(rule, ctx)) continue;
      await execute(rule, ctx).catch((err) => console.error(`[automations] «${rule.name}»`, err));
    }
  });
}

/** Условия: этап, источник, канал. Пустое условие — подходит всё. */
export function matches(rule: Pick<CrmAutomation, "conditions">, ctx: TriggerContext) {
  const c = rule.conditions ?? {};
  for (const key of ["stageId", "source", "channel"] as const) {
    const want = c[key];
    if (want && String(want) !== String(ctx[key] ?? "")) return false;
  }
  return true;
}

async function execute(rule: CrmAutomation, ctx: TriggerContext) {
  // Отметка о срабатывании до действий: при гонке двух вебхуков выполнит только один.
  const claimed = await db.insert(crmAutomationRuns).values({ automationId: rule.id, subject: ctx.subject.slice(0, 200) }).onConflictDoNothing().returning({ id: crmAutomationRuns.id });
  if (!claimed.length) return;
  const loaded = await loadContext(ctx);
  for (const action of rule.actions ?? []) await runAction(rule, action, ctx, loaded);
  await db
    .update(crmAutomations)
    .set({ runs: sql`${crmAutomations.runs} + 1`, lastRunAt: new Date() })
    .where(eq(crmAutomations.id, rule.id));
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
  const vars = { name: e.name, order: e.order?.number ?? null, link: env.appUrl, manager: await managerName(e.assigneeId) };
  switch (a.type) {
    case "create_task": {
      const assigneeId = a.userId || e.assigneeId;
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

/** Правила по времени: «клиенту не ответили N минут». Вызывается фоновым планировщиком раз в минуту. */
export async function runScheduledAutomations() {
  const rules = await db.select().from(crmAutomations).where(and(eq(crmAutomations.trigger, "message.unanswered"), eq(crmAutomations.active, true)));
  let fired = 0;
  for (const rule of rules) {
    const minutes = Math.max(1, Number(rule.conditions?.minutes ?? 15) || 15);
    const convs = await db
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.status, "open"), isNotNull(crmConversations.awaitingSince), lte(crmConversations.awaitingSince, new Date(Date.now() - minutes * 60_000))))
      .limit(200);
    for (const c of convs) {
      const ctx: TriggerContext = { subject: `${c.id}:${c.awaitingSince!.toISOString()}`, conversationId: c.id, dealId: c.dealId, clientId: c.clientId, channel: c.channel };
      if (!matches(rule, ctx)) continue;
      await depth.run(1, () => execute(rule, ctx)).catch((err) => console.error(`[automations] «${rule.name}»`, err));
      fired++;
    }
  }
  return fired;
}
