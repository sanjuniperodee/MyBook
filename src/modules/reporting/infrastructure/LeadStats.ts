import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import type { LeadDealRow, LeadPaymentRow, RegisterRow } from "../ui/lead-stats";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const date = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/** Первая оплата сделки (не возврат) и сколько по ней пришло всего (возвраты вычтены). */
const firstPayment = sql.raw(`left join lateral (
  select min(p.paid_at) filter (where p.kind <> 'refund') as first_at,
    (array_agg(p.amount order by p.paid_at) filter (where p.kind <> 'refund'))[1] as first_amount,
    coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0)::int as paid
  from crm_payments p where p.deal_id = d.id
) f on true`);

/**
 * Когда клиент обратился: начало его переписки по сделке, если оно раньше самой сделки. Менеджер при продаже заводит
 * сделку договорённости, и заявка из чата вливается в неё вместе с перепиской — дата сделки тогда равна дню продажи,
 * а не дню обращения. channel — канал первого диалога (whatsapp, site…): откуда человек написал.
 */
const firstContact = sql.raw(`left join lateral (
  select min(c.created_at) as first_at, (array_agg(c.channel order by c.created_at))[1] as channel
  from crm_conversations c where c.deal_id = d.id
) cv on true`);
const leadAt = sql.raw(`least(d.created_at, coalesce(cv.first_at, d.created_at))`);

/**
 * «Статистика лидов» за период [from, to): заявки (сделки, созданные в периоде, со всем, что нужно для разрезов:
 * источник, ответственный, этап, причина отказа, кому и по какому поводу книга, первая оплата), первые оплаты по дате
 * оплаты (как в ежедневной таблице РНП: оплата считается в день денег, а не в день заявки), выставленные счета по дням
 * и расход на рекламу по дням. Пустые дубли «повторный клиент» с сайта заявками не считаются.
 */
export async function leadStats(range: { from: Date; to: Date; first: string; last: string }) {
  const db = executor();
  const [deals, payments, invoices, spend] = await Promise.all([
    db.execute<Row>(sql`
      select d.id, d.number, ${leadAt} as created_at, d.source, cv.channel as conv_channel, d.utm, d.assignee_id, d.amount, d.lost_reason, d.closed_at, d.repeat_count,
        d.custom_fields->>'recipient' as recipient, d.custom_fields->>'occasion' as occasion, d.custom_fields->>'event_date' as event_date,
        s.id as stage_id, s.name as stage, s.kind as stage_kind, s.position as stage_position, pl.name as pipeline,
        f.first_at, f.first_amount, f.paid
      from crm_deals d
      join crm_stages s on s.id = d.stage_id
      join crm_pipelines pl on pl.id = s.pipeline_id
      ${firstPayment}
      ${firstContact}
      where ${leadAt} >= ${at(range.from)} and ${leadAt} < ${at(range.to)}
        and not (d.source = 'site' and d.repeat_count > 0 and d.amount = 0 and d.order_id is null and f.first_at is null)
      order by 3`),
    db.execute<Row>(sql`
      select d.id as deal_id, d.assignee_id, d.amount, ${leadAt} as created_at, f.first_at, f.first_amount
      from crm_deals d
      ${firstPayment}
      ${firstContact}
      where f.first_at >= ${at(range.from)} and f.first_at < ${at(range.to)}
      order by f.first_at`),
    db.execute<Row>(sql`select i.created_at, i.issued_by_id, d.assignee_id from deal_invoices i join crm_deals d on d.id = i.deal_id where i.created_at >= ${at(range.from)} and i.created_at < ${at(range.to)}`),
    db.execute<Row>(sql`select day, coalesce(sum(amount), 0)::int as amount from marketing_spend where day >= ${range.first} and day <= ${range.last} group by day`),
  ]);
  return {
    deals: deals.rows.map(
      (x): LeadDealRow => ({
        id: String(x.id),
        number: num(x.number),
        createdAt: date(x.created_at)!,
        source: String(x.source ?? ""),
        entry: String(x.conv_channel ?? x.source ?? ""),
        utm: x.utm ?? null,
        assigneeId: str(x.assignee_id),
        amount: num(x.amount),
        lostReason: str(x.lost_reason),
        closedAt: date(x.closed_at),
        repeat: num(x.repeat_count) > 0,
        recipient: str(x.recipient),
        occasion: str(x.occasion),
        eventDate: str(x.event_date),
        stageId: String(x.stage_id),
        stage: String(x.stage),
        stageKind: String(x.stage_kind) as LeadDealRow["stageKind"],
        stagePosition: num(x.stage_position),
        pipeline: String(x.pipeline),
        firstPaidAt: date(x.first_at),
        firstAmount: x.first_amount === null || x.first_amount === undefined ? 0 : num(x.first_amount),
        paid: num(x.paid),
      }),
    ),
    payments: payments.rows.map((x): LeadPaymentRow => ({ dealId: String(x.deal_id), assigneeId: str(x.assignee_id), amount: num(x.amount), dealCreatedAt: date(x.created_at)!, at: date(x.first_at)!, first: num(x.first_amount) })),
    invoices: invoices.rows.map((x) => ({ at: date(x.created_at)!, assigneeId: str(x.assignee_id) })),
    spend: spend.rows.map((x) => ({ day: String(x.day), amount: num(x.amount) })),
  };
}

/**
 * «Реестр продаж»: по строке на покупателя — сделки с первой оплатой в периоде [from, to). Цена — сумма договорённости;
 * оплачено — платежи сделки (возвраты вычтены) и оплаты её заказа из журнала денег заказа; остаток — что ещё не пришло.
 * Город, срок и состояние — из заказа, если он оформлен; иначе этап сделки и прогресс книги.
 */
export async function salesRegister(range: { from: Date; to: Date }): Promise<RegisterRow[]> {
  const r = await executor().execute<Row>(sql`
    select d.id, d.number, ${leadAt} as created_at, d.source, d.utm, d.assignee_id, d.amount, d.agreed_plan, d.client_id,
      coalesce(nullif(d.contact_name, ''), nullif(u.name, ''), d.title) as client, coalesce(d.contact_phone, u.phone) as phone,
      d.custom_fields->>'recipient' as recipient, d.custom_fields->>'event_date' as event_date, d.custom_fields->>'pay_form' as pay_form,
      s.name as stage, s.kind as stage_kind,
      f.first_at, f.paid,
      (select p.method from crm_payments p where p.deal_id = d.id and p.kind <> 'refund' order by p.paid_at limit 1) as method,
      o.id as order_id, o.number as order_number, o.status as order_status, o.city, o.desired_date, o.amount as order_due, o.quantity,
      coalesce((select sum(case when op.kind = 'refund' then -op.amount else op.amount end) from order_payments op where op.order_id = o.id and op.voided_at is null), 0)::int as order_paid,
      (o.paid_at is not null) as order_settled,
      -- Деньги с указанной формой оплаты платежа (форма → сумма): комиссия с них — по их форме, с остального — по форме сделки.
      (select json_object_agg(z.form, z.s) from (
        select x.form, sum(x.amount)::int as s from (
          select p.pay_form as form, case when p.kind = 'refund' then -p.amount else p.amount end as amount from crm_payments p where p.deal_id = d.id and p.pay_form is not null
          union all
          select op.pay_form, case when op.kind = 'refund' then -op.amount else op.amount end from order_payments op where op.order_id = o.id and op.pay_form is not null and op.voided_at is null
        ) x group by x.form) z) as paid_forms,
      (select coalesce(sum(length(q.answer)), 0) from books b join book_questions q on q.book_id = b.id where b.user_id = d.client_id)::int as chars
    from crm_deals d
    join crm_stages s on s.id = d.stage_id
    left join users u on u.id = d.client_id
    left join orders o on o.id = d.order_id and o.status <> 'cancelled'
    ${firstPayment}
    ${firstContact}
    where f.first_at >= ${at(range.from)} and f.first_at < ${at(range.to)}
    order by f.first_at desc`);
  return r.rows.map((x) => ({
    id: String(x.id),
    number: num(x.number),
    createdAt: date(x.created_at)!,
    soldAt: date(x.first_at)!,
    source: String(x.source ?? ""),
    utm: x.utm ?? null,
    assigneeId: str(x.assignee_id),
    client: String(x.client ?? ""),
    phone: str(x.phone),
    plan: str(x.agreed_plan),
    recipient: str(x.recipient),
    eventDate: str(x.event_date),
    payForm: str(x.pay_form),
    paidForms: x.paid_forms && typeof x.paid_forms === "object" ? Object.fromEntries(Object.entries(x.paid_forms as Record<string, unknown>).map(([k, v]) => [k, num(v)])) : {},
    price: num(x.amount),
    dealPaid: num(x.paid),
    method: str(x.method),
    stage: String(x.stage),
    stageKind: String(x.stage_kind) as RegisterRow["stageKind"],
    orderId: str(x.order_id),
    orderNumber: x.order_number === null || x.order_number === undefined ? null : num(x.order_number),
    orderStatus: str(x.order_status),
    city: str(x.city),
    desiredDate: str(x.desired_date),
    orderDue: x.order_due === null || x.order_due === undefined ? null : num(x.order_due),
    // Заказ оплачен без записи в журнале денег (старые заказы, «подтвердить оплату») — считаем оплаченным целиком.
    orderPaid: x.order_settled && num(x.order_paid) < num(x.order_due) ? num(x.order_due) : num(x.order_paid),
    quantity: x.quantity === null || x.quantity === undefined ? 1 : num(x.quantity),
    chars: num(x.chars),
  }));
}
