import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

/** Повторные продажи правила за период: сколько сделок оно создало, сколько выиграно, сколько по ним оплачено (₸). */
export interface RuleSalesStats {
  created: number;
  won: number;
  amount: number;
}

/** Окно статистики правил на странице «Автоматизации». */
export const RULE_STATS_DAYS = 90;

/**
 * Статистика правил (contacts-16): сделки, которые правило создало за days дней (crm_deals.automation_id, частичный
 * индекс), — создано, выиграно и оплачено по ним по вьюхе revenue_events (заказ, платежи по сделке, выигранная сделка
 * без заказа; возвраты — минусом). Ключ — id правила; правила без созданных сделок в карте нет.
 */
export async function automationStats(days = RULE_STATS_DAYS): Promise<Map<string, RuleSalesStats>> {
  const { rows } = await executor().execute<{ automation_id: string; created: number; won: number; amount: string | number }>(sql`
    select d.automation_id, count(*)::int as created, (count(*) filter (where s.kind = 'won'))::int as won,
      coalesce(sum(m.amount), 0)::bigint as amount
    from crm_deals d
    join crm_stages s on s.id = d.stage_id
    left join lateral (select sum(e.amount) as amount from revenue_events e where e.deal_id = d.id) m on true
    where d.automation_id is not null and d.created_at >= now() - make_interval(days => ${days})
    group by d.automation_id`);
  return new Map(rows.map((r) => [r.automation_id, { created: r.created, won: r.won, amount: Number(r.amount) }]));
}
