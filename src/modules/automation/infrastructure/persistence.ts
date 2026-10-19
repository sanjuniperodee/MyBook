import "server-only";
import { and, asc, desc, eq, gt, isNotNull, lte, or, sql } from "drizzle-orm";
import { books, crmAutomationRuns, crmAutomations, crmCalls, crmConversations, crmDeals, dealInvoices, orders, users } from "@/shared/infrastructure/db/schema";
import { appLink } from "@/shared/infrastructure/mail";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate } from "@/lib/dates";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { storeTimeZone } from "@/shared/domain/time";
import { executor } from "@/shared/infrastructure/database";
import { filledBelowSql, progressCols } from "@/shared/infrastructure/db/bookProgress";
import type { CustomFieldsReader } from "@/shared/application";
import { fieldVars } from "@/shared/domain/customFields";
import type { RuleRepository, ScheduledSource, SubjectLoader } from "../application";
import type { AutomationRule, Holiday, RuleSubject, TriggerContext } from "../domain";

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
    const [order] = orderId ? await db.select({ id: orders.id, number: orders.number, status: orders.status, trackingNumber: orders.trackingNumber, bookId: orders.bookId }).from(orders).where(eq(orders.id, orderId)).limit(1) : [];
    const clientId = ctx.clientId ?? deal?.clientId ?? conv?.clientId ?? call?.clientId ?? null;
    const [client] = clientId ? await db.select({ name: users.name, managerId: users.managerId, locale: users.locale }).from(users).where(eq(users.id, clientId)).limit(1) : [];
    const locale = client?.locale === "kk" ? "kk" : "ru";
    return {
      deal: deal ? { id: deal.id, number: deal.number, title: deal.title, assigneeId: deal.assigneeId, orderId: deal.orderId, clientId: deal.clientId, customFields: deal.customFields } : null,
      conversation: conv ? { id: conv.id, assigneeId: conv.assigneeId, contactName: conv.contactName, lastMessageText: conv.lastMessageText, clientId: conv.clientId } : null,
      call: call ? { id: call.id, staffId: call.staffId, clientId: call.clientId } : null,
      orderNumber: order?.number ?? null,
      trackingNumber: order?.trackingNumber ?? null,
      links: await this.links(order ?? null, deal?.id ?? null, clientId, locale),
      clientId,
      name: deal?.contactName || conv?.contactName || client?.name || "",
      assigneeId: deal?.assigneeId ?? conv?.assigneeId ?? call?.staffId ?? client?.managerId ?? null,
      locale,
    };
  }

  /**
   * Ссылки на сайт на языке клиента. Книга — книга заказа, иначе последняя книга клиента (books_user_idx). Оплата —
   * неоплаченный заказ, иначе открытый неистёкший счёт из чата по сделке (deal_invoices_open_idx).
   */
  private async links(order: { id: string; status: string; bookId: string } | null, dealId: string | null, clientId: string | null, locale: "ru" | "kk") {
    const db = executor();
    const [book] = order ? [{ id: order.bookId }] : clientId ? await db.select({ id: books.id }).from(books).where(eq(books.userId, clientId)).orderBy(desc(books.updatedAt)).limit(1) : [];
    const unpaid = order?.status === "pending_payment";
    const [invoice] =
      !unpaid && dealId
        ? await db
            .select({ token: dealInvoices.token })
            .from(dealInvoices)
            .where(and(eq(dealInvoices.dealId, dealId), eq(dealInvoices.status, "pending_payment"), gt(dealInvoices.expiresAt, new Date())))
            .limit(1)
        : [];
    const orderUrl = order ? appLink(`/orders/${order.id}`, locale) : null;
    return { order: orderUrl, book: book ? appLink(`/books/${book.id}`, locale) : null, pay: unpaid ? orderUrl : invoice ? appLink(`/pay/${invoice.token}`, locale) : null };
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

  /** Диалоги сделки и клиента — по индексам crm_conv_deal_idx и crm_conv_client_idx. */
  async latestWhatsapp(dealId: string | null, clientId: string | null) {
    const of = [dealId ? eq(crmConversations.dealId, dealId) : undefined, clientId ? eq(crmConversations.clientId, clientId) : undefined].filter((c) => c !== undefined);
    if (!of.length) return null;
    const [c] = await executor()
      .select({ id: crmConversations.id })
      .from(crmConversations)
      .where(and(eq(crmConversations.channel, "whatsapp"), or(...of)))
      .orderBy(sql`${crmConversations.lastMessageAt} desc nulls last`, desc(crmConversations.id))
      .limit(1);
    return c?.id ?? null;
  }

  async clientContact(clientId: string) {
    const [u] = await executor().select({ name: users.name, email: users.email, phone: users.phone, managerId: users.managerId }).from(users).where(eq(users.id, clientId)).limit(1);
    return u ?? null;
  }
}

/** Сколько объектов правило по времени берёт за проход. */
const LIMIT = 200;
/** «Клиент молчит после нашего ответа» — до 100 диалогов за проход (задачи менеджерам; остальные — в следующий). */
const SILENT_LIMIT = 100;

/** Момент как в Date.toISOString() (2026-10-01T06:00:00.000Z) — так он записан в subject срабатывания. */
const isoText = (at: unknown) => sql`to_char(${at} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Правило ещё не срабатывало для этого объекта (subject — тот же, что в TriggerContext): обработанные не занимают
 * место в выборке, и новые объекты не теряются за лимитом. Поиск по уникальному индексу (automation_id, subject).
 */
const notFired = (ruleId: string, subject: ReturnType<typeof sql>) => sql`not exists (select 1 from crm_automation_runs r where r.automation_id = ${ruleId}::uuid and r.subject = ${subject})`;

/** Начало местного дня day (ГГГГ-ММ-ДД или выражение date) по поясу магазина — момент для сравнения с timestamptz. */
const dayStart = (day: string | ReturnType<typeof sql>, tz: string) => sql`((${day})::date::timestamp at time zone ${tz})`;

/** Подпись выпускного в поле «Повод» сделки (как в CRM): выпускной не повторяется — годовщины нет. */
const GRADUATION_LABEL = (messagesFor("ru").common.occasions as Record<string, { label: string }>).graduation.label;

const occasionsOf = (locale: Locale) => messagesFor(locale).common.occasions as Record<string, { label: string }>;
const OCCASION_FALLBACK: Record<Locale, string> = { ru: "памятная дата", kk: "есте қаларлық күн" };

/**
 * Повод по коду книги (birthday) или по подписи из поля «Повод» сделки («День рождения» — поле по-русски, как в CRM),
 * на языке locale. Своя подпись, которой нет в словаре, — как есть; пустая — «памятная дата».
 */
export function occasionLabel(code: string | null, label: string | null, locale: Locale) {
  const ru = occasionsOf("ru");
  const key = code ?? Object.keys(ru).find((k) => ru[k].label === label?.trim());
  return (key && occasionsOf(locale)[key]?.label) || label?.trim() || OCCASION_FALLBACK[locale];
}

/**
 * Текст из своего поля как дата ГГГГ-ММ-ДД или null. Неверная дата (2026-02-30, «15.11») не роняет выборку: приведение
 * к date — только после проверки формата и числа дней в месяце (CASE гарантирует порядок вычисления).
 */
const safeDate = (text: ReturnType<typeof sql>) => sql`case when ${text} ~ '^[12][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
  case when substr(${text}, 9, 2)::int <= extract(day from make_date(substr(${text}, 1, 4)::int, substr(${text}, 6, 2)::int, 1) + interval '1 month - 1 day')::int then (${text})::date end end`;

/**
 * Клиент купил в день from или позже (по поясу магазина): оплатил заказ или выиграна сделка — кроме самой покупки (except:
 * заказ, сделка; сделка этого заказа — та же покупка). Поиск по клиенту — индексы orders_user_idx и crm_deals_client_idx.
 */
const boughtSince = (clientId: ReturnType<typeof sql>, from: ReturnType<typeof sql>, tz: string, except: { order: ReturnType<typeof sql>; deal: ReturnType<typeof sql> }) => sql`(
  exists (select 1 from orders o where o.user_id = ${clientId} and ${paidAndNotCancelled} and (o.paid_at at time zone ${tz})::date >= ${from}
    and o.id is distinct from ${except.order})
  or exists (select 1 from crm_deals wd join crm_stages ws on ws.id = wd.stage_id and ws.kind = 'won'
    where wd.client_id = ${clientId} and (coalesce(wd.closed_at, wd.stage_changed_at) at time zone ${tz})::date >= ${from}
      and wd.id is distinct from ${except.deal} and (${except.order} is null or wd.order_id is distinct from ${except.order})))`;

/** Номер в виде normalizePhone (77011234567) — так их хранит стоп-лист. */
const normalizedPhone = (raw: ReturnType<typeof sql>) => sql`(select case when length(x) = 11 and left(x, 1) = '8' then '7' || substr(x, 2)
  when length(x) = 10 and x ~ '^[3-9]' then '7' || x else x end from regexp_replace(coalesce(${raw}, ''), '[^0-9]', '', 'g') as x)`;

/**
 * Клиент (строка users под алиасом) просил не писать первым или помечен спамом (стоп-лист, contacts-18): его телефон,
 * доп. телефон или собеседник его диалога в crm_blocklist. Как noMarketingFor в переписке, только в SQL выборки.
 * Телефоны — по первичному ключу стоп-листа; диалоги клиентов из стоп-листа — один раз на запрос (некоррелированный IN).
 */
const noMarketing = (u: ReturnType<typeof sql>) => sql`(
  exists (select 1 from crm_blocklist bl where bl.value = any (array(select ${normalizedPhone(sql`p`)} from unnest(array[${u}.phone] || ${u}.extra_phones) as p)))
  or ${u}.id in (select bc.client_id from crm_conversations bc join crm_blocklist bl on bl.value = bc.chat_id where bc.client_id is not null))`;

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
   * Ближайшая годовщина повода, до которой осталось не больше N дней. Покупки: оплаченный заказ сайта (дата повода книги
   * или желаемая дата заказа) и выигранная сделка из чата без оплаченного заказа (свои поля «Дата события» и «Повод»,
   * contacts-16). Выпускной не повторяется. Не выбираются: клиент, который уже купил к этой годовщине снова (automation-d6)
   * — оплата или выигранная сделка не раньше чем за repurchaseDays дней до неё, или другая, более поздняя покупка с
   * годовщиной в тот же день (купил к этой дате в этом году, покупает каждый год); и тот, кто просил не писать первым
   * (стоп-лист). Покупка к другому поводу между годовщинами годовщину не гасит. Ближайшие — первыми; покупка, по которой
   * правило уже сработало в этом году, не выбирается.
   */
  async anniversaries(ruleId: string, today: string, daysBefore: number, repurchaseDays: number) {
    const tz = storeTimeZone();
    const { rows } = await executor().execute<{ order_id: string | null; deal_id: string | null; client_id: string; code: string | null; label: string | null; recipient: string | null; locale: string; next_date: string; year: number }>(sql`
      with base as (
        select o.id as order_id, null::uuid as deal_id, o.user_id as client_id, b.occasion as code, null::text as label,
          nullif(b.recipient_name, '') as recipient, coalesce(b.occasion_date, o.desired_date)::date as d
        from orders o join books b on b.id = o.book_id
        where ${paidAndNotCancelled} and coalesce(b.occasion_date, o.desired_date) is not null
          and coalesce(b.occasion, '') <> 'graduation'
        union all
        select null, d.id, d.client_id, null, nullif(d.custom_fields->>'occasion', ''), nullif(d.custom_fields->>'recipient', ''), ${safeDate(sql`d.custom_fields->>'event_date'`)}
        from crm_deals d join crm_stages s on s.id = d.stage_id and s.kind = 'won'
        where d.client_id is not null and coalesce(d.custom_fields->>'occasion', '') <> ${GRADUATION_LABEL}
          and not exists (select 1 from orders o where o.id = d.order_id and ${paidAndNotCancelled})
      ), nxt as (
        select *, (d + make_interval(years => extract(year from ${today}::date)::int - extract(year from d)::int))::date as this_year from base where d is not null
      ), nxt2 as (
        select *, case when this_year < ${today}::date then (this_year + interval '1 year')::date else this_year end as next_date from nxt
      )
      select n.order_id, n.deal_id, n.client_id, n.code, n.label, n.recipient, u.locale, to_char(n.next_date, 'YYYY-MM-DD') as next_date, extract(year from n.next_date)::int as year
      from nxt2 n join users u on u.id = n.client_id
      where n.next_date > n.d and n.next_date - ${today}::date between 0 and ${daysBefore}
        and ${notFired(ruleId, sql`case when n.order_id is not null then n.order_id::text else 'deal:' || n.deal_id::text end || ':' || extract(year from n.next_date)::int::text`)}
        and not ${boughtSince(sql`n.client_id`, sql`n.next_date - ${repurchaseDays}::int`, tz, { order: sql`n.order_id`, deal: sql`n.deal_id` })}
        and not exists (select 1 from nxt2 x where x.client_id = n.client_id and x.next_date = n.next_date and x.d > n.d)
        and not ${noMarketing(sql`u`)}
      order by n.next_date, n.order_id, n.deal_id
      limit ${LIMIT}`);
    return rows.map((r) => {
      const locale = r.locale === "kk" ? "kk" : "ru";
      return {
        orderId: r.order_id,
        dealId: r.deal_id,
        clientId: r.client_id,
        occasion: occasionLabel(r.code, r.label, "ru"),
        date: formatDate(r.next_date),
        year: r.year,
        recipient: r.recipient?.trim() || null,
        client: { occasion: occasionLabel(r.code, r.label, locale), date: formatDate(r.next_date, false, locale) },
      };
    });
  }

  async holidayBuyers(ruleId: string, q: { holiday: Holiday; date: string; from: string; to: string; seasonFrom: string; limit: number }) {
    const tz = storeTimeZone();
    const year = Number(q.date.slice(0, 4));
    const { rows } = await executor().execute<{ client_id: string; locale: string }>(sql`
      with bought as (
        select e.client_id, min(e.at) as first_at
        from revenue_events e
        where e.kind <> 'refund' and e.client_id is not null and e.at >= ${dayStart(q.from, tz)} and e.at < ${dayStart(sql`${q.to}::date + 1`, tz)}
        group by e.client_id
      )
      select b.client_id, u.locale
      from bought b join users u on u.id = b.client_id
      where not exists (select 1 from crm_deals d join crm_stages s on s.id = d.stage_id and s.kind = 'open' where d.client_id = b.client_id)
        and b.client_id not in (select e.client_id from revenue_events e where e.kind <> 'refund' and e.client_id is not null and e.at >= ${dayStart(q.seasonFrom, tz)})
        and not ${noMarketing(sql`u`)}
        and ${notFired(ruleId, sql`${`holiday:${q.holiday.id}:${year}:`} || b.client_id::text`)}
      order by b.first_at, b.client_id
      limit ${Math.max(0, Math.min(q.limit, LIMIT))}`);
    return rows.map((r) => {
      const locale = r.locale === "kk" ? "kk" : "ru";
      return { clientId: r.client_id, occasion: q.holiday.ru, date: formatDate(q.date), client: { occasion: q.holiday[locale], date: formatDate(q.date, false, locale) } };
    });
  }

  /**
   * Открытые сделки с «Датой события» в днях from…to — по индексу crm_deals_event_date_idx (текст ГГГГ-ММ-ДД
   * сравнивается как дата; неверную дату вроде 2026-02-30 отсекает safeDate). «Неразобранные» заявки — не в работе.
   * Книга сделки — книга её заказа, иначе последняя книга клиента с вопросами (как на доске сделок); заказ уже в печати,
   * отправлен или доставлен — книга готова. Оплачено — заказ сделки оплачен или по сделке (пакету сделок) приняты деньги.
   */
  async eventDates(ruleId: string, q: { from: string; to: string; bookBelow: number | null; unpaid: boolean }) {
    const eventDate = sql`(d.custom_fields->>'event_date')`;
    const net = sql`sum(case when p.kind = 'refund' then -p.amount else p.amount end)`;
    // Платежи — по crm_payments_deal_idx; у пакета сделок (несколько книг одной оплатой) — по всем сделкам пакета.
    const paid = sql`(exists (select 1 from orders o where o.id = d.order_id and ${paidAndNotCancelled})
      or coalesce((select ${net} from crm_payments p where p.deal_id = d.id), 0)
        + case when d.batch_id is null then 0 else coalesce((select ${net} from crm_payments p join crm_deals b on b.id = p.deal_id where b.batch_id = d.batch_id and b.id <> d.id), 0) end > 0)`;
    const printed = sql`exists (select 1 from orders o where o.id = d.order_id and o.status in ('in_production', 'shipped', 'delivered'))`;
    const bookId = sql`coalesce((select o.book_id from orders o where o.id = d.order_id),
      (select b.id from books b where b.user_id = d.client_id and exists (select 1 from book_questions q0 where q0.book_id = b.id) order by b.updated_at desc limit 1))`;
    // Нет книги — заполнена на 0%; книга, заполненная на percent и больше, — не выбирается.
    const notFilled = (percent: number) =>
      sql`not ${printed} and not exists (select 1 from books bk where bk.id = ${bookId} and not ${filledBelowSql({ theme: sql`bk.theme`, ...progressCols(sql`bk.id`) }, percent)})`;
    const { rows } = await executor().execute<{ deal_id: string; client_id: string | null; event_date: string; label: string | null; locale: string | null }>(sql`
      select d.id as deal_id, d.client_id, ${eventDate} as event_date, nullif(d.custom_fields->>'occasion', '') as label, u.locale
      from crm_deals d
      join crm_stages s on s.id = d.stage_id and s.kind = 'open'
      left join users u on u.id = d.client_id
      where ${eventDate} between ${q.from} and ${q.to}
        and ${safeDate(eventDate)} is not null
        and not d.unsorted
        and ${notFired(ruleId, sql`'deal:' || d.id::text || ':event_date:' || ${eventDate}`)}
        ${q.unpaid ? sql`and not ${paid}` : sql``}
        ${q.bookBelow ? sql`and ${notFilled(q.bookBelow)}` : sql``}
      order by ${eventDate}, d.id
      limit ${LIMIT}`);
    return rows.map((r) => {
      const locale = r.locale === "kk" ? "kk" : "ru";
      return {
        dealId: r.deal_id,
        clientId: r.client_id,
        eventDate: r.event_date,
        occasion: occasionLabel(null, r.label, "ru"),
        date: formatDate(r.event_date),
        client: { occasion: occasionLabel(null, r.label, locale), date: formatDate(r.event_date, false, locale) },
      };
    });
  }

  /**
   * Открытые сделки, по которым с before ничего не происходило. Кандидаты — по индексу crm_deals_stage_idx (этап, смена
   * этапа): этап открытый и не менялся с before, сделка не «неразобранная», открытой задачи нет (crm_tasks_open_deal_idx),
   * клиент и собеседники её чатов не в стоп-листе, ни один её чат не ведёт бот (как isActive бота и silent(): состояние не
   * «done» и бот не остановлен кнопкой; чаты сделки — по crm_conv_deal_idx) — AI-продажник может ждать дня, который назвал
   * клиент (bots-5), и задача «связаться» раньше срока нарушила бы договорённость. У кандидата последняя активность —
   * самое позднее из: смены этапа; последнего сообщения в каждом чате сделки, кроме сообщений правил (входящее, ответ из
   * CRM, эхо ответа с телефона магазина, бот; по crm_messages_conv_idx — с конца до первого подходящего); задачи сделки —
   * поставлена или закрыта (crm_tasks_deal_idx); звонка (crm_calls_deal_idx); заметки сотрудника (crm_notes_deal_idx) —
   * один раз на кандидата (materialized: фильтр, subject и порядок не пересчитывают подзапросы). Недавно затихшие —
   * первыми: их ещё можно вернуть.
   */
  async idleDeals(ruleId: string, q: { before: Date; stageId: string | null; limit: number }) {
    const before = sql`${q.before.toISOString()}::timestamptz`;
    const { rows } = await executor().execute<{ deal_id: string; client_id: string | null; stage_id: string; last_at: Date | string }>(sql`
      with cand as materialized (
        select d.id, d.client_id, d.stage_id, greatest(
          d.stage_changed_at,
          (select max(m.at) from crm_conversations cv cross join lateral (
            select x.created_at as at from crm_messages x
            where x.conversation_id = cv.id and x.source is distinct from 'rule'
            order by x.created_at desc limit 1) m
           where cv.deal_id = d.id),
          (select max(greatest(t.created_at, t.done_at)) from crm_tasks t where t.deal_id = d.id),
          (select max(k.started_at) from crm_calls k where k.deal_id = d.id),
          (select max(n.created_at) from crm_notes n where n.deal_id = d.id and n.author_id is not null)
        ) as last_at
        from crm_deals d
        join crm_stages s on s.id = d.stage_id and s.kind = 'open'
        left join users u on u.id = d.client_id
        where d.stage_changed_at < ${before}
          ${q.stageId ? sql`and d.stage_id = ${q.stageId}::uuid` : sql``}
          and not d.unsorted
          and not exists (select 1 from crm_tasks t where t.deal_id = d.id and t.done_at is null)
          and not exists (select 1 from crm_conversations bc join crm_blocklist bl on bl.value = bc.chat_id where bc.deal_id = d.id)
          and not exists (select 1 from crm_conversations bc where bc.deal_id = d.id and coalesce(bc.bot_state->>'phase', 'done') <> 'done' and coalesce(bc.bot_step, 0) <> -1)
          and (u.id is null or not ${noMarketing(sql`u`)})
      )
      select c.id as deal_id, c.client_id, c.stage_id, c.last_at
      from cand c
      where c.last_at < ${before}
        and ${notFired(ruleId, sql`'deal:' || c.id::text || ':idle:' || ${isoText(sql`c.last_at`)}`)}
      order by c.last_at desc, c.id
      limit ${Math.max(0, Math.min(q.limit, LIMIT))}`);
    return rows.map((r) => {
      const lastActivity = new Date(r.last_at);
      return { dealId: r.deal_id, clientId: r.client_id, stageId: r.stage_id, lastActivity, date: formatDate(lastActivity) };
    });
  }

  /**
   * Диалоги, где наш последний ответ (last_outgoing_at: из CRM или эхо с телефона магазина) — в since…before, по индексу
   * crm_conv_last_out_idx, и после него клиент не писал (crm_messages_conv_idx; «спасибо», снятое AI с ожидания, —
   * тоже ответ клиента). Диалог открыт и не ждёт ответа, бот его не ведёт (как isActive бота: состояние не «done» и бот
   * не остановлен кнопкой). Сделка диалога в работе и без открытой задачи — следующий шаг не запланирован. Собеседник
   * и клиент не в стоп-листе: напомнить о себе такому — нарушить его просьбу. Дольше всех молчащие — первыми.
   */
  async silent(ruleId: string, q: { before: Date; since: Date }) {
    const { rows } = await executor().execute<{ id: string; deal_id: string; client_id: string | null; channel: string; at: Date | string }>(sql`
      select c.id, c.deal_id, coalesce(c.client_id, d.client_id) as client_id, c.channel, c.last_outgoing_at as at
      from crm_conversations c
      join crm_deals d on d.id = c.deal_id
      join crm_stages s on s.id = d.stage_id and s.kind = 'open'
      left join users u on u.id = coalesce(c.client_id, d.client_id)
      where c.last_outgoing_at <= ${q.before.toISOString()}::timestamptz and c.last_outgoing_at > ${q.since.toISOString()}::timestamptz
        and c.status = 'open' and c.awaiting_since is null
        and not (coalesce(c.bot_state->>'phase', 'done') <> 'done' and coalesce(c.bot_step, 0) <> -1)
        and not exists (select 1 from crm_messages m where m.conversation_id = c.id and m.direction = 'in' and m.created_at > c.last_outgoing_at)
        and not exists (select 1 from crm_tasks t where t.deal_id = c.deal_id and t.done_at is null)
        and not exists (select 1 from crm_blocklist bl where bl.value = c.chat_id)
        and (u.id is null or not ${noMarketing(sql`u`)})
        and ${notFired(ruleId, sql`'conv:' || c.id::text || ':silent:' || ${isoText(sql`c.last_outgoing_at`)}`)}
      order by c.last_outgoing_at, c.id
      limit ${SILENT_LIMIT}`);
    return rows.map((r) => {
      const lastOutgoingAt = new Date(r.at);
      return { conversationId: r.id, dealId: r.deal_id, clientId: r.client_id, channel: r.channel, lastOutgoingAt, date: formatDate(lastOutgoingAt) };
    });
  }

  async firedOn(ruleId: string, day: string) {
    const { rows } = await executor().execute<{ n: number }>(sql`
      select count(*)::int as n from crm_automation_runs where automation_id = ${ruleId}::uuid and created_at >= ${dayStart(day, storeTimeZone())}`);
    return Number(rows[0]?.n ?? 0);
  }
}
