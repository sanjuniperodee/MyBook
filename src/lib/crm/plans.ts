import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { crmPlans } from "../db/schema";

/** Текущий месяц по Алматы: YYYY-MM. */
export const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "Asia/Almaty", year: "numeric", month: "2-digit" }).format(new Date());

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface PlanProgress {
  userId: string;
  planAmount: number;
  planDeals: number;
  factAmount: number;
  factDeals: number;
}

/** План и факт за месяц: факт — успешные сделки сотрудника, закрытые в этом месяце (по Алматы). */
export async function planProgress(month: string, userIds?: string[]): Promise<Map<string, PlanProgress>> {
  const [plans, facts] = await Promise.all([
    db
      .select()
      .from(crmPlans)
      .where(and(eq(crmPlans.month, month), userIds ? inArray(crmPlans.userId, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]) : undefined)),
    db.execute<{ user_id: string; amount: number; deals: number }>(sql`
      select d.assignee_id as user_id, coalesce(sum(d.amount), 0)::int as amount, count(*)::int as deals
      from crm_deals d join crm_stages s on s.id = d.stage_id
      where s.kind = 'won' and d.assignee_id is not null
        and to_char(d.closed_at at time zone 'Asia/Almaty', 'YYYY-MM') = ${month}
      group by d.assignee_id`),
  ]);
  const out = new Map<string, PlanProgress>();
  const get = (id: string) => out.get(id) ?? out.set(id, { userId: id, planAmount: 0, planDeals: 0, factAmount: 0, factDeals: 0 }).get(id)!;
  for (const p of plans) Object.assign(get(p.userId), { planAmount: p.amount, planDeals: p.deals });
  for (const f of facts.rows) if (!userIds || userIds.includes(f.user_id)) Object.assign(get(f.user_id), { factAmount: f.amount, factDeals: f.deals });
  return out;
}
