import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

/**
 * Записать примечание к сделке, если в базе всё ещё прежний текст (before): правку другого сотрудника, сделанную
 * за это время, молча не затираем. «missing» — сделки нет, «changed» — текст уже другой.
 */
export async function setDealNote(dealId: string, note: string, before: string): Promise<"ok" | "changed" | "missing"> {
  const r = await executor().execute<{ note: string; saved: boolean }>(sql`
    with cur as (select id, note from crm_deals where id = ${dealId} for update),
    upd as (update crm_deals d set note = ${note}, updated_at = now() from cur where d.id = cur.id and cur.note = ${before} returning d.id)
    select cur.note, exists(select 1 from upd) as saved from cur`);
  const row = r.rows[0];
  if (!row) return "missing";
  return row.saved || row.note === note ? "ok" : "changed";
}
