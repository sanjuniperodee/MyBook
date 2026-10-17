import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

/** Тариф, о котором договорились по сделке (null — не указан). Меняется, пока по сделке нет заказа. */
export async function setDealAgreedPlan(dealId: string, plan: string | null): Promise<boolean> {
  const r = await executor().execute(sql`update crm_deals set agreed_plan = ${plan}, updated_at = now() where id = ${dealId} and order_id is null returning id`);
  return r.rows.length > 0;
}

export async function dealAgreedPlan(dealId: string): Promise<string | null> {
  const r = await executor().execute<{ plan: string | null }>(sql`select agreed_plan as plan from crm_deals where id = ${dealId}`);
  return r.rows[0]?.plan ?? null;
}

/** Сделка — одна из книг пакета (клиент оплатил сразу несколько): batch — общий номер пакета, index с нуля, size — сколько книг. */
export async function setDealBatch(dealId: string, batchId: string, index: number, size: number): Promise<void> {
  await executor().execute(sql`update crm_deals set batch_id = ${batchId}, batch_index = ${index}, batch_size = ${size} where id = ${dealId}`);
}

/** Остальные сделки пакета (по порядку книг) — для карточки сделки. */
export async function dealBatch(dealId: string): Promise<{ id: string; number: number; index: number; size: number; hasOrder: boolean }[]> {
  const r = await executor().execute<{ id: string; number: number; idx: number; size: number; has_order: boolean }>(sql`
    select b.id, b.number, b.batch_index as idx, b.batch_size as size, b.order_id is not null as has_order
    from crm_deals d join crm_deals b on b.batch_id = d.batch_id
    where d.id = ${dealId} and d.batch_id is not null order by b.batch_index`);
  return r.rows.map((x) => ({ id: x.id, number: x.number, index: x.idx, size: x.size, hasOrder: x.has_order }));
}
