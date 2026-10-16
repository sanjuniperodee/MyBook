import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import type { DealMoney } from "../application";

export interface DealAgreement {
  dealId: string;
  dealNumber: number;
  /** Цена книги (первого экземпляра выбранного тарифа), о которой договорились, ₸. Доставка и допы считаются сверху. */
  agreedTotal: number;
  /** Уже принято менеджером (платежи минус возвраты), ₸. */
  prepaid: number;
  /** Тариф, о котором договорились (PlanId), если менеджер его указал. */
  plan: string | null;
  /** Срок, к которому клиенту нужна книга (поле «дата события» сделки), YYYY-MM-DD. */
  deadline: string | null;
}

/**
 * «Договорённость» по сделке d (chat-invoices 1.3) — одно правило для всех мест, где решается, вычитать ли предоплату:
 * сделка заведена менеджером (источник «вручную») или оплачена по счёту из чата (тариф договорённости и деньги).
 * Без тарифа сделка с деньгами договорённостью не считается: иначе её цена стала бы потолком для любого тарифа.
 */
const isAgreement = (d: SQL) => sql`(${d}.source = 'manual' or (${d}.agreed_plan is not null and exists (select 1 from crm_payments p where p.deal_id = ${d}.id)))`;

/** Принято по сделке: платежи минус возвраты. */
const paidSum = (d: SQL) => sql`coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = ${d}.id), 0)::int`;

/**
 * Договорённость с клиентом: сделка-договорённость (см. isAgreement) с суммой, по которой ещё нет заказа, — открытая или
 * в «успехе» с принятыми деньгами. Когда клиент оформляет заказ на сайте, цена берётся отсюда, а предоплата вычитается из «к оплате».
 */
export async function agreementForClient(userId: string): Promise<DealAgreement | null> {
  const d = sql.raw("d");
  const r = await executor().execute<{ id: string; number: number; amount: number; paid: number; deadline: string | null; plan: string | null }>(sql`
    select d.id, d.number, d.amount, d.agreed_plan as plan, nullif(d.custom_fields->>'event_date', '') as deadline, ${paidSum(d)} as paid
    from crm_deals d join crm_stages s on s.id = d.stage_id
    where d.client_id = ${userId} and d.order_id is null and d.amount > 0 and ${isAgreement(d)}
      -- Сделку без заказа, но с деньгами, могли перевести в «успех» вручную: договорённость по ней всё равно действует.
      and (s.kind = 'open' or (s.kind = 'won' and exists (select 1 from crm_payments p where p.deal_id = d.id)))
    order by (s.kind = 'open') desc, d.created_at desc limit 1`);
  const row = r.rows[0];
  return row ? { dealId: row.id, dealNumber: row.number, agreedTotal: row.amount, prepaid: Math.max(0, row.paid), plan: row.plan, deadline: row.deadline && /^\d{4}-\d{2}-\d{2}$/.test(row.deadline) ? row.deadline : null } : null;
}

/** Деньги клиента по сделке и договорённость по ней — тем же правилом, что и agreementForClient. */
export async function dealMoney(dealId: string): Promise<DealMoney> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { paid: 0, agreement: false };
  const d = sql.raw("d");
  const r = await executor().execute<{ paid: number; agreement: boolean }>(sql`select ${paidSum(d)} as paid, ${isAgreement(d)} as agreement from crm_deals d where d.id = ${dealId}`);
  const row = r.rows[0];
  return row ? { paid: row.paid, agreement: !!row.agreement } : { paid: 0, agreement: false };
}

/**
 * Заказ по договорённости — к её сделке, в транзакции оформления: с этого момента «у сделки есть заказ» видят и счета
 * из чата (новый не выставить, оплата старого — «нужен возврат или зачёт»), а не только после подписчика воронки.
 * false — у сделки уже другой заказ.
 */
export async function attachAgreementOrder(dealId: string, orderId: string): Promise<boolean> {
  const r = await executor().execute(sql`update crm_deals set order_id = ${orderId}, updated_at = now() where id = ${dealId} and (order_id is null or order_id = ${orderId}) returning id`);
  return r.rows.length > 0;
}
