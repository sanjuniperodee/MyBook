import "server-only";
import { and, asc, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { crmAutomationRuns, crmAutomations, crmCalls, crmConversations, crmDeals, orders, users } from "@/shared/infrastructure/db/schema";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate } from "@/lib/dates";
import { messagesFor } from "@/i18n/messages";
import { executor } from "@/shared/infrastructure/database";
import type { CustomFieldsReader } from "@/shared/application";
import { fieldVars } from "@/shared/domain/customFields";
import type { RuleRepository, ScheduledSource, SubjectLoader } from "../application";
import type { AutomationRule, RuleSubject, TriggerContext } from "../domain";

/** Заказ (алиас o) оплачен по paid_at и не отменён; не isPaid() из ordering (тот — по статусу). */
const paidAndNotCancelled = sql`o.paid_at is not null and o.status <> 'cancelled'`;
/** Заказ (алиас o) не отменён — в том числе ещё не оплачен. */
const notCancelled = sql`o.status <> 'cancelled'`;

export class DrizzleRuleRepository implements RuleRepository {
  async active(trigger?: string): Promise<AutomationRule[]> {
    return executor()
      .select({ id: crmAutomations.id, name: crmAutomations.name, trigger: crmAutomations.trigger, conditions: crmAutomations.conditions, actions: crmAutomations.actions })
      .from(crmAutomations)
      .where(and(eq(crmAutomations.active, true), trigger ? eq(crmAutomations.trigger, trigger) : undefined));
  }
  async claim(ruleId: string, subject: string) {
    const rows = await executor().insert(crmAutomationRuns).values({ automationId: ruleId, subject }).onConflictDoNothing().returning({ id: crmAutomationRuns.id });
    return rows.length > 0;
  }
  async markRun(ruleId: string, at: Date) {
    await executor()
      .update(crmAutomations)
      .set({ runs: sql`${crmAutomations.runs} + 1`, lastRunAt: at })
      .where(eq(crmAutomations.id, ruleId));
  }
}

export class DrizzleSubjectLoader implements SubjectLoader {
  constructor(private readonly fields: CustomFieldsReader) {}

  async load(ctx: TriggerContext): Promise<RuleSubject> {
    const db = executor();
    const [deal] = ctx.dealId ? await db.select().from(crmDeals).where(eq(crmDeals.id, ctx.dealId)).limit(1) : [];
    const [conv] = ctx.conversationId ? await db.select().from(crmConversations).where(eq(crmConversations.id, ctx.conversationId)).limit(1) : [];
    const [call] = ctx.callId ? await db.select().from(crmCalls).where(eq(crmCalls.id, ctx.callId)).limit(1) : [];
    const orderId = ctx.orderId ?? deal?.orderId;
    const [order] = orderId ? await db.select({ number: orders.number }).from(orders).where(eq(orders.id, orderId)).limit(1) : [];
    const clientId = ctx.clientId ?? deal?.clientId ?? conv?.clientId ?? call?.clientId ?? null;
    const [client] = clientId ? await db.select({ name: users.name, managerId: users.managerId }).from(users).where(eq(users.id, clientId)).limit(1) : [];
    return {
      deal: deal ? { id: deal.id, number: deal.number, title: deal.title, assigneeId: deal.assigneeId, orderId: deal.orderId, clientId: deal.clientId, customFields: deal.customFields } : null,
      conversation: conv ? { id: conv.id, assigneeId: conv.assigneeId, contactName: conv.contactName, lastMessageText: conv.lastMessageText, clientId: conv.clientId } : null,
      call: call ? { id: call.id, staffId: call.staffId, clientId: call.clientId } : null,
      orderNumber: order?.number ?? null,
      clientId,
      name: deal?.contactName || conv?.contactName || client?.name || "",
      assigneeId: deal?.assigneeId ?? conv?.assigneeId ?? call?.staffId ?? client?.managerId ?? null,
    };
  }

  async managerName(userId: string | null) {
    if (!userId) return "";
    const [u] = await executor().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    return u ? staffLabel(u) : "";
  }

  async dealFieldVars(customFields: Record<string, string | number | boolean | null>) {
    return fieldVars(await this.fields.list("deal"), customFields);
  }

  async latestConversation(dealId: string | null, clientId: string | null) {
    const cond = dealId ? eq(crmConversations.dealId, dealId) : clientId ? eq(crmConversations.clientId, clientId) : null;
    if (!cond) return null;
    const [c] = await executor().select({ id: crmConversations.id }).from(crmConversations).where(cond).orderBy(desc(crmConversations.lastMessageAt)).limit(1);
    return c?.id ?? null;
  }

  async clientContact(clientId: string) {
    const [u] = await executor().select({ name: users.name, email: users.email, phone: users.phone, managerId: users.managerId }).from(users).where(eq(users.id, clientId)).limit(1);
    return u ?? null;
  }
}

/** Сколько объектов правило по времени берёт за проход. */
const LIMIT = 200;

/** Момент как в Date.toISOString() (2026-10-01T06:00:00.000Z) — так он записан в subject срабатывания. */
const isoText = (at: unknown) => sql`to_char(${at} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Правило ещё не срабатывало для этого объекта (subject — тот же, что в TriggerContext): обработанные не занимают
 * место в выборке, и новые объекты не теряются за лимитом. Поиск по уникальному индексу (automation_id, subject).
 */
const notFired = (ruleId: string, subject: ReturnType<typeof sql>) => sql`not exists (select 1 from crm_automation_runs r where r.automation_id = ${ruleId}::uuid and r.subject = ${subject})`;

export class SqlScheduledSource implements ScheduledSource {
  /** Дольше всех ждущие — первыми; диалог, по которому правило уже сработало за это ожидание, не выбирается. */
  async unanswered(ruleId: string, awaitingSince: Date) {
    const rows = await executor()
      .select({ conversationId: crmConversations.id, dealId: crmConversations.dealId, clientId: crmConversations.clientId, channel: crmConversations.channel, awaitingSince: crmConversations.awaitingSince })
      .from(crmConversations)
      .where(
        and(
          eq(crmConversations.status, "open"),
          isNotNull(crmConversations.awaitingSince),
          lte(crmConversations.awaitingSince, awaitingSince),
          notFired(ruleId, sql`${crmConversations.id}::text || ':' || ${isoText(crmConversations.awaitingSince)}`),
        ),
      )
      .orderBy(asc(crmConversations.awaitingSince), asc(crmConversations.id))
      .limit(LIMIT);
    return rows.map((r) => ({ ...r, awaitingSince: r.awaitingSince! }));
  }

  /**
   * Открытая сделка, черновик книги, клиент давно не заходил и не заказывал после этого. Недавно ушедшие — первыми (их
   * ещё можно вернуть); сделка, по которой правило уже сработало за этот уход, не выбирается.
   */
  async inactiveClients(ruleId: string, days: number) {
    const { rows } = await executor().execute<{ deal_id: string; client_id: string; last_seen: Date | string }>(sql`
      select d.id as deal_id, d.client_id, coalesce(u.last_seen_at, u.created_at) as last_seen
      from crm_deals d
      join crm_stages s on s.id = d.stage_id and s.kind = 'open'
      join users u on u.id = d.client_id
      where coalesce(u.last_seen_at, u.created_at) < now() - make_interval(days => ${days})
        and exists (select 1 from books b where b.user_id = u.id and b.status = 'draft')
        and not exists (select 1 from orders o where o.user_id = u.id and ${notCancelled} and o.created_at > coalesce(u.last_seen_at, u.created_at))
        and ${notFired(ruleId, sql`d.id::text || ':' || ${isoText(sql`coalesce(u.last_seen_at, u.created_at)`)}`)}
      order by last_seen desc, d.id
      limit ${LIMIT}`);
    return rows.map((r) => ({ dealId: r.deal_id, clientId: r.client_id, lastSeen: new Date(r.last_seen) }));
  }

  /**
   * Ближайшая годовщина даты повода (или желаемой даты заказа), до которой осталось не больше N дней. Ближайшие — первыми;
   * заказ, по которому правило уже сработало в этом году, не выбирается.
   */
  async anniversaries(ruleId: string, daysBefore: number) {
    const { rows } = await executor().execute<{ order_id: string; client_id: string; occasion: string | null; next_date: string; year: number }>(sql`
      with base as (
        select o.id as order_id, o.user_id as client_id, b.occasion, coalesce(b.occasion_date, o.desired_date)::date as d
        from orders o join books b on b.id = o.book_id
        where ${paidAndNotCancelled} and coalesce(b.occasion_date, o.desired_date) is not null
          and coalesce(b.occasion, '') <> 'graduation'
      ), nxt as (
        select *, (d + make_interval(years => extract(year from current_date)::int - extract(year from d)::int))::date as this_year from base
      ), nxt2 as (
        select *, case when this_year < current_date then (this_year + interval '1 year')::date else this_year end as next_date from nxt
      )
      select order_id, client_id, occasion, to_char(next_date, 'YYYY-MM-DD') as next_date, extract(year from next_date)::int as year
      from nxt2 where next_date > d and next_date - current_date between 0 and ${daysBefore}
        and ${notFired(ruleId, sql`order_id::text || ':' || extract(year from next_date)::int::text`)}
      order by next_date, order_id
      limit ${LIMIT}`);
    const labels = messagesFor("ru").common.occasions as Record<string, { label: string }>;
    return rows.map((r) => ({ orderId: r.order_id, clientId: r.client_id, occasion: (r.occasion && labels[r.occasion]?.label) || "памятная дата", date: formatDate(r.next_date), year: r.year }));
  }
}
