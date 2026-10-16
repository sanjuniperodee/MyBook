import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { REFUND_WINDOW_DAYS, type FinanceDealRow, type FinanceOrderRow, type MoneyRow, type ReviewRow, type UnrecordedRow } from "../ui/finance-screen";

type Row = Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const date = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/** Сделка заказа (первая по времени), если их несколько, — чтобы заказ не размножался в выборке. */
const orderDeal = sql.raw(`left join lateral (select d.id, d.number, d.assignee_id from crm_deals d where d.order_id = o.id order by d.created_at limit 1) od on true`);


/**
 * Деньги за период [from, to) — каждая сумма ровно один раз:
 * - платежи сделок (crm_payments): предоплаты, доплаты, возвраты; ручные с чеком и онлайн по счёту из чата;
 * - журнал денег заказов (order_payments): переводы с чеком и онлайн-оплаты; заказ по договорённости хранит только
 *   «к оплате», предоплата сделки в нём вычтена, — поэтому платёж сделки и оплата заказа не пересекаются;
 * - заказы, оплаченные без записи в журнале (до журнала или «подтвердить оплату» без денег): к оплате − записано
 *   в журнал, на дату paid_at; как только оплату приложат с чеком, остаток уходит в ноль — без двойного счёта;
 * - оплаченные подарочные сертификаты (их промокод потом уменьшает «к оплате» заказа — тоже без двойного счёта).
 * Не считаются: заказы и записи журнала отменённых заказов (как в выручке — деньги нужно вернуть; они в «Нужен возврат»),
 * оплаты Kaspi, не записанные в учёт (тоже там), и успешные сделки без денег (выручка по договорённости, а не деньги).
 */
export async function financeMoney(from: Date, to: Date): Promise<MoneyRow[]> {
  const r = await executor().execute<Row>(sql`
    select * from (
      select p.id, 'deal' as source, p.kind, case p.method when 'cloudpayments' then 'card' else p.method end as method, p.amount, p.paid_at as at,
        d.id as deal_id, d.number as deal_number, o.id as order_id, o.number as order_number, null::int as gift_number,
        coalesce(nullif(d.contact_name, ''), nullif(u.name, ''), d.title) as client, d.assignee_id as manager_id, p.created_by_id as accepted_by_id,
        (select r.id from crm_receipts r where r.payment_id = p.id order by r.created_at limit 1) as receipt_id,
        p.external_ref, i.number as invoice_number, p.reviewed_at
      from crm_payments p
      join crm_deals d on d.id = p.deal_id
      left join users u on u.id = d.client_id
      left join orders o on o.id = d.order_id
      left join deal_invoices i on i.id = p.invoice_id
      where p.paid_at >= ${at(from)} and p.paid_at < ${at(to)}
      union all
      select op.id, 'order', 'order', case op.method when 'cloudpayments' then 'card' else op.method end, op.amount, op.paid_at,
        od.id, od.number, o.id, o.number, null,
        o.contact_name, coalesce(od.assignee_id, o.assignee_id), op.created_by_id,
        case when op.receipt_storage_key is not null then op.id end,
        op.external_ref, null, op.reviewed_at
      from order_payments op
      join orders o on o.id = op.order_id
      ${orderDeal}
      where op.paid_at >= ${at(from)} and op.paid_at < ${at(to)} and o.status <> 'cancelled'
      union all
      select o.id, 'order', 'legacy',
        case when o.payment_id like 'kaspi:%' then 'kaspi' when o.payment_provider = 'cloudpayments' and o.payment_id ~ '^[0-9]+$' then 'card' else 'manual' end,
        o.amount - coalesce(j.sum, 0), o.paid_at,
        od.id, od.number, o.id, o.number, null,
        o.contact_name, coalesce(od.assignee_id, o.assignee_id), null, null, null, null, null
      from orders o
      ${orderDeal}
      left join lateral (select sum(x.amount)::int as sum from order_payments x where x.order_id = o.id) j on true
      where o.paid_at >= ${at(from)} and o.paid_at < ${at(to)} and o.status <> 'cancelled' and o.amount > coalesce(j.sum, 0)
      union all
      select g.id, 'gift', 'gift',
        case when g.payment_id like 'kaspi:%' then 'kaspi' when g.payment_id ~ '^[0-9]+$' then 'card' else 'manual' end,
        g.amount, g.paid_at, null, null, null, null, g.number,
        g.buyer_name, null, null, null, null, null, null
      from gift_cards g
      where g.paid_at >= ${at(from)} and g.paid_at < ${at(to)} and g.status <> 'cancelled' and g.amount > 0
    ) m
    order by at desc`);
  return r.rows.map((x) => ({
    id: String(x.id),
    source: x.source as MoneyRow["source"],
    kind: x.kind as MoneyRow["kind"],
    method: x.method as MoneyRow["method"],
    amount: num(x.amount),
    at: date(x.at)!,
    dealId: str(x.deal_id),
    dealNumber: x.deal_number === null ? null : num(x.deal_number),
    orderId: str(x.order_id),
    orderNumber: x.order_number === null ? null : num(x.order_number),
    giftNumber: x.gift_number === null ? null : num(x.gift_number),
    client: String(x.client ?? ""),
    managerId: str(x.manager_id),
    acceptedById: str(x.accepted_by_id),
    receiptId: str(x.receipt_id),
    externalRef: str(x.external_ref),
    invoiceNumber: x.invoice_number === null ? null : num(x.invoice_number),
    reviewedAt: date(x.reviewed_at),
  }));
}

/**
 * Сделки, по которым ждём или должны деньги: договорённость без заказа (открытая, в «успехе» или «отказе» с деньгами,
 * с открытым счётом из чата) и сделки с заказом, где по сделке внесено больше, чем заказ учёл предоплатой.
 * Прогресс книги — самая продвинутая книга клиента (ответов из вопросов); счёт — открытый счёт из чата.
 */
export async function financeDeals(): Promise<FinanceDealRow[]> {
  const r = await executor().execute<Row>(sql`
    select d.id, d.number, coalesce(nullif(d.contact_name, ''), nullif(u.name, ''), d.title) as client, d.assignee_id as manager_id,
      d.amount as agreed, d.agreed_plan as plan, d.source, s.kind as stage_kind, s.milestone, d.client_id is not null as has_client,
      nullif(d.custom_fields->>'event_date', '') as event_date, pay.paid, pay.n as payments,
      bk.answered, bk.total,
      inv.number as invoice_number, inv.amount as invoice_amount, inv.expires_at as invoice_expires_at, inv.claimed_at as invoice_claimed_at,
      o.id as order_id, o.number as order_number, o.prepaid_amount as order_prepaid
    from crm_deals d
    join crm_stages s on s.id = d.stage_id
    left join users u on u.id = d.client_id
    left join orders o on o.id = d.order_id
    cross join lateral (
      select coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0)::int as paid, count(*) filter (where p.kind <> 'refund')::int as n
      from crm_payments p where p.deal_id = d.id
    ) pay
    left join lateral (
      select count(q.id) filter (where length(trim(q.answer)) > 0)::int as answered, count(q.id)::int as total
      from books b left join book_questions q on q.book_id = b.id
      where b.user_id = d.client_id
      group by b.id order by 1 desc, 2 desc limit 1
    ) bk on true
    left join deal_invoices inv on inv.deal_id = d.id and inv.status = 'pending_payment'
    where (d.order_id is null and (pay.n > 0 or inv.id is not null or (s.kind = 'open' and d.amount > 0 and (d.source = 'manual' or d.agreed_plan is not null))))
      or (d.order_id is not null and o.status <> 'cancelled' and pay.paid > o.prepaid_amount)`);
  return r.rows.map((x) => ({
    id: String(x.id),
    number: num(x.number),
    client: String(x.client ?? ""),
    managerId: str(x.manager_id),
    agreed: num(x.agreed),
    paid: num(x.paid),
    payments: num(x.payments),
    plan: str(x.plan),
    source: String(x.source),
    stageKind: x.stage_kind as FinanceDealRow["stageKind"],
    milestone: str(x.milestone),
    hasClient: !!x.has_client,
    eventDate: typeof x.event_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.event_date) ? x.event_date : null,
    book: x.total === null || x.total === undefined ? null : { answered: num(x.answered), total: num(x.total) },
    invoice: x.invoice_number === null ? null : { number: num(x.invoice_number), amount: num(x.invoice_amount), expiresAt: date(x.invoice_expires_at)!, claimedAt: date(x.invoice_claimed_at) },
    order: x.order_id === null ? null : { id: String(x.order_id), number: num(x.order_number), prepaid: num(x.order_prepaid) },
  }));
}

/**
 * Заказы, по которым ждём или должны деньги: ждут оплаты (к оплате − записано > 0), постоплата (в печати и дальше без
 * полной оплаты), переплата (записано больше «к оплате») и отменённые, по которым деньги получены (за последние дни).
 */
export async function financeOrders(): Promise<FinanceOrderRow[]> {
  const r = await executor().execute<Row>(sql`
    select o.id, o.number, o.contact_name as client, coalesce(od.assignee_id, o.assignee_id) as manager_id, od.id as deal_id, od.number as deal_number,
      o.status, o.postpay, o.amount, o.prepaid_amount as prepaid, o.paid_at, o.desired_date, o.created_at, o.payment_claimed_at,
      coalesce(j.sum, 0)::int as received
    from orders o
    ${orderDeal}
    left join lateral (select sum(x.amount)::int as sum, max(x.paid_at) as last_at from order_payments x where x.order_id = o.id) j on true
    where (o.status = 'pending_payment' and o.amount > coalesce(j.sum, 0))
      or (o.status <> 'cancelled' and o.postpay and o.paid_at is null)
      or (o.status <> 'cancelled' and coalesce(j.sum, 0) > o.amount)
      or (o.status = 'cancelled' and coalesce(j.sum, 0) > 0 and j.last_at >= now() - make_interval(days => ${REFUND_WINDOW_DAYS}))`);
  return r.rows.map((x) => ({
    id: String(x.id),
    number: num(x.number),
    client: String(x.client ?? ""),
    managerId: str(x.manager_id),
    dealId: str(x.deal_id),
    dealNumber: x.deal_number === null ? null : num(x.deal_number),
    status: String(x.status),
    postpay: !!x.postpay,
    amount: num(x.amount),
    prepaid: num(x.prepaid),
    received: num(x.received),
    paidAt: date(x.paid_at),
    desiredDate: typeof x.desired_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.desired_date) ? x.desired_date : null,
    createdAt: date(x.created_at)!,
    claimedAt: date(x.payment_claimed_at),
  }));
}

/**
 * Оплаты Kaspi, которые платёжная система подтвердила, а в учёт они не попали: счёт из чата по сделке, где уже заказ
 * (деньги не зачесть), второй платёж за сертификат, оплата заказа вне журнала, оплата с суммой не по счёту.
 * Нужен возврат или зачёт.
 * Сопоставление — по операции Kaspi (external_ref = номер операции, с префиксом «kaspi:» или без).
 */
export async function financeUnrecorded(): Promise<UnrecordedRow[]> {
  const r = await executor().execute<Row>(sql`
    select pi.id, pi.target_kind, pi.external_id, pi.status = 'failed' as mismatch,
      case when pi.status = 'failed' and substring(pi.provider_status from 16) ~ '^[0-9]+$' then substring(pi.provider_status from 16)::int else pi.amount end as amount,
      coalesce(pi.paid_at, pi.updated_at) as at,
      i.number as invoice_number, d.id as deal_id, d.number as deal_number, o.id as order_id, o.number as order_number, g.number as gift_number,
      coalesce(d.assignee_id, o.assignee_id) as manager_id,
      coalesce(nullif(d.contact_name, ''), nullif(i.client_name, ''), o.contact_name, g.buyer_name, '') as client
    from payment_invoices pi
    left join deal_invoices i on pi.target_kind = 'deal_invoice' and i.id = pi.target_id
    left join crm_deals d on d.id = i.deal_id
    left join orders o on pi.target_kind = 'order' and o.id = pi.target_id
    left join gift_cards g on pi.target_kind = 'gift' and g.id = pi.target_id
    where pi.provider = 'kaspi' and coalesce(pi.paid_at, pi.updated_at) >= now() - make_interval(days => ${REFUND_WINDOW_DAYS})
      -- Сумма оплаты не совпала со счётом: Kaspi деньги принял, мы платёж не засчитали (provider_status «AmountMismatch:<сумма>»).
      and ((pi.status = 'failed' and pi.provider_status like 'AmountMismatch:%') or (pi.status = 'paid' and case pi.target_kind
        when 'deal_invoice' then not exists (select 1 from crm_payments p where p.method = 'kaspi' and p.external_ref in (pi.external_id, 'kaspi:' || pi.external_id))
        when 'order' then not exists (select 1 from order_payments x where x.method = 'kaspi' and x.external_ref in (pi.external_id, 'kaspi:' || pi.external_id))
        when 'gift' then g.payment_id is distinct from 'kaspi:' || pi.external_id
        else false end))
    order by at desc`);
  return r.rows.map((x) => ({
    id: String(x.id),
    target: x.target_kind as UnrecordedRow["target"],
    externalId: String(x.external_id),
    mismatch: !!x.mismatch,
    amount: num(x.amount),
    at: date(x.at)!,
    invoiceNumber: x.invoice_number === null ? null : num(x.invoice_number),
    dealId: str(x.deal_id),
    dealNumber: x.deal_number === null ? null : num(x.deal_number),
    orderId: str(x.order_id),
    orderNumber: x.order_number === null ? null : num(x.order_number),
    giftNumber: x.gift_number === null ? null : num(x.gift_number),
    managerId: str(x.manager_id),
    client: String(x.client ?? ""),
  }));
}

/** Сколько ручных подтверждений ждёт проверки — показываем первыми самые свежие. */
const REVIEW_LIMIT = 1000;

/**
 * «Проверить»: деньги, которые записал сотрудник (перевод с чеком), а руководитель ещё не сверил с поступлением на счёт.
 * Платежи сделок (без возвратов) и ручные оплаты заказов; онлайн-платежи подтверждает платёжная система — их здесь нет.
 */
export async function financeReview(): Promise<ReviewRow[]> {
  const r = await executor().execute<Row>(sql`
    select * from (
      select 'deal' as kind, p.id, p.kind as payment_kind, p.amount, p.paid_at as at, p.created_by_id as accepted_by_id,
        d.id as deal_id, d.number as deal_number, o.id as order_id, o.number as order_number, d.assignee_id as manager_id,
        coalesce(nullif(d.contact_name, ''), nullif(u.name, ''), d.title) as client,
        (select r.id from crm_receipts r where r.payment_id = p.id order by r.created_at limit 1) as receipt_id,
        p.note, i.number as invoice_number
      from crm_payments p
      join crm_deals d on d.id = p.deal_id
      left join users u on u.id = d.client_id
      left join orders o on o.id = d.order_id
      left join deal_invoices i on i.id = p.invoice_id
      where p.method = 'manual' and p.kind <> 'refund' and p.reviewed_at is null
      union all
      select 'order', op.id, 'order', op.amount, op.paid_at, op.created_by_id,
        od.id, od.number, o.id, o.number, coalesce(od.assignee_id, o.assignee_id),
        o.contact_name, case when op.receipt_storage_key is not null then op.id end,
        op.note, null
      from order_payments op
      join orders o on o.id = op.order_id
      ${orderDeal}
      where op.method = 'manual' and op.reviewed_at is null
    ) r
    order by at desc
    limit ${REVIEW_LIMIT}`);
  return r.rows.map((x) => ({
    kind: x.kind as ReviewRow["kind"],
    id: String(x.id),
    paymentKind: String(x.payment_kind),
    amount: num(x.amount),
    at: date(x.at)!,
    acceptedById: str(x.accepted_by_id),
    dealId: str(x.deal_id),
    dealNumber: x.deal_number === null ? null : num(x.deal_number),
    orderId: str(x.order_id),
    orderNumber: x.order_number === null ? null : num(x.order_number),
    managerId: str(x.manager_id),
    client: String(x.client ?? ""),
    receiptId: str(x.receipt_id),
    note: String(x.note ?? ""),
    invoiceNumber: x.invoice_number === null ? null : num(x.invoice_number),
  }));
}

/** Всё для страницы «Финансы»: деньги за период (вместе с прошлым — для сравнения), ожидаемые, должные и «проверить». */
export async function financeReport(range: { from: Date; to: Date }) {
  const [money, deals, orders, unrecorded, review] = await Promise.all([financeMoney(range.from, range.to), financeDeals(), financeOrders(), financeUnrecorded(), financeReview()]);
  return { money, deals, orders, unrecorded, review };
}
