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
