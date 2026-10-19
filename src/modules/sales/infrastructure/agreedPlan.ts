import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { readGifts, type AgreementGift } from "@/shared/domain/agreementGifts";

/** Тариф, о котором договорились по сделке (null — не указан). Меняется, пока по сделке нет заказа. */
export async function setDealAgreedPlan(dealId: string, plan: string | null): Promise<boolean> {
  const r = await executor().execute(sql`update crm_deals set agreed_plan = ${plan}, updated_at = now() where id = ${dealId} and order_id is null returning id`);
  return r.rows.length > 0;
}

/** Что по договорённости бесплатно (упаковка, доставка). Меняется, пока по сделке нет заказа. */
export async function setDealAgreedGifts(dealId: string, gifts: AgreementGift[]): Promise<boolean> {
  const value = readGifts(gifts);
  const r = await executor().execute(sql`update crm_deals set agreed_gifts = ${`{${value.join(",")}}`}::text[], updated_at = now() where id = ${dealId} and order_id is null returning id`);
  return r.rows.length > 0;
}

export async function dealAgreedGifts(dealId: string): Promise<AgreementGift[]> {
  const r = await executor().execute<{ gifts: string[] | null }>(sql`select agreed_gifts as gifts from crm_deals where id = ${dealId}`);
  return readGifts(r.rows[0]?.gifts ?? []);
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

/** Размер пакета сделки (null — не пакет) и деньги по всему пакету: платежи минус возвраты по всем его сделкам. */
export async function dealBatchMoney(dealId: string): Promise<{ size: number | null; paid: number }> {
  const r = await executor().execute<{ size: number | null; paid: number }>(sql`
    select d.batch_size as size,
      case when d.batch_id is null then coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = d.id), 0)
      else coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p join crm_deals b on b.id = p.deal_id where b.batch_id = d.batch_id), 0) end::int as paid
    from crm_deals d where d.id = ${dealId}`);
  return { size: r.rows[0]?.size ?? null, paid: r.rows[0]?.paid ?? 0 };
}

/** Сделки пакета, которых ещё нет: книга 1 из N уже есть (сделка dealId) — остальные заводятся копиями. Названия получают «· k из N». */
export async function markBatchMembers(dealId: string, batchId: string, siblings: { id: string }[]): Promise<void> {
  const size = siblings.length + 1;
  await setDealBatch(dealId, batchId, 0, size);
  for (let i = 0; i < siblings.length; i++) await setDealBatch(siblings[i].id, batchId, i + 1, size);
  await executor().execute(sql`update crm_deals set title = title || ' · ' || (batch_index + 1) || ' из ' || batch_size where batch_id = ${batchId} and title not like '% из %'`);
}
