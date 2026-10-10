import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

export interface DealAgreement {
  dealId: string;
  dealNumber: number;
  /** Итоговая цена заказа, о которой договорились, ₸. */
  agreedTotal: number;
  /** Уже принято менеджером (платежи минус возвраты), ₸. */
  prepaid: number;
}

/**
 * Договорённость с клиентом по ручной сделке: открытая сделка, заведённая менеджером (источник «вручную»), с суммой,
 * по которой ещё нет заказа. Когда клиент оформляет заказ на сайте, цена берётся отсюда, а предоплата вычитается из «к оплате».
 */
export async function agreementForClient(userId: string): Promise<DealAgreement | null> {
  const r = await executor().execute<{ id: string; number: number; amount: number; paid: number }>(sql`
    select d.id, d.number, d.amount,
      coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = d.id), 0)::int as paid
    from crm_deals d join crm_stages s on s.id = d.stage_id
    where d.client_id = ${userId} and d.source = 'manual' and d.order_id is null and d.amount > 0 and s.kind = 'open'
    order by d.created_at desc limit 1`);
  const row = r.rows[0];
  return row ? { dealId: row.id, dealNumber: row.number, agreedTotal: row.amount, prepaid: Math.max(0, row.paid) } : null;
}
