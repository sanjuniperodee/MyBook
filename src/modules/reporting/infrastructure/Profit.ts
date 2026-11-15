import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { financeMoney } from "./Finance";
import type { ExpenseRow, ProfitCounts } from "../ui/profit-screen";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/**
 * Расходы за дни [first, last] (ГГГГ-ММ-ДД по времени магазина): записи «Расходов» и реклама из расходов по каналам
 * маркетинга одной ведомостью — реклама идёт категорией ads с каналом вместо названия. Свежие — первыми.
 */
export async function expenseRows(first: string, last: string): Promise<ExpenseRow[]> {
  const r = await executor().execute<Row>(sql`
    select * from (
      select e.id, 'expense' as source, e.day, e.category, e.title, e.amount, e.quantity, e.note, null::text as channel, e.created_by_id, e.created_at
      from finance_expenses e where e.day >= ${first} and e.day <= ${last}
      union all
      select s.id, 'ads', s.day, 'ads', '', s.amount, null, s.note, s.channel, s.created_by_id, s.created_at
      from marketing_spend s where s.day >= ${first} and s.day <= ${last}
    ) x
    order by day desc, created_at desc`);
  return r.rows.map((x) => ({
    id: String(x.id),
    source: x.source as ExpenseRow["source"],
    day: String(x.day),
    category: String(x.category),
    title: String(x.title ?? ""),
    amount: num(x.amount),
    quantity: x.quantity === null || x.quantity === undefined ? null : num(x.quantity),
    note: String(x.note ?? ""),
    channel: x.channel === null || x.channel === undefined ? null : String(x.channel),
    createdById: x.created_by_id === null || x.created_by_id === undefined ? null : String(x.created_by_id),
    createdAt: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
  }));
}

/**
 * Счётчики периода [from, to) для экономики продаж: новые заявки (сделки без спама и без пустых дублей «повторный клиент»
 * с сайта), новые покупатели (сделки с первой оплатой в периоде), их сумма по договорённости и первая оплата, оформленные
 * заказы (не отменённые).
 */
async function profitCounts(from: Date, to: Date): Promise<ProfitCounts> {
  const db = executor();
  const [leads, buyers, orders] = await Promise.all([
    db.execute<Row>(sql`
      select count(*)::int as n from crm_deals d
      where d.created_at >= ${at(from)} and d.created_at < ${at(to)}
        and coalesce(d.lost_reason, '') not ilike 'спам%'
        and not (d.source = 'site' and d.repeat_count > 0 and d.amount = 0 and d.order_id is null)`),
    db.execute<Row>(sql`
      select count(*)::int as n, coalesce(sum(f.amount), 0)::int as first_sum, coalesce(sum(greatest(d.amount, f.amount)), 0)::int as agreed
      from crm_deals d
      join lateral (
        select p.paid_at, p.amount from crm_payments p where p.deal_id = d.id and p.kind <> 'refund' order by p.paid_at limit 1
      ) f on true
      where f.paid_at >= ${at(from)} and f.paid_at < ${at(to)}`),
    db.execute<Row>(sql`select count(*)::int as n, coalesce(sum(o.quantity), 0)::int as books from orders o where o.created_at >= ${at(from)} and o.created_at < ${at(to)} and o.status <> 'cancelled'`),
  ]);
  return {
    leads: num(leads.rows[0]?.n),
    buyers: num(buyers.rows[0]?.n),
    buyersFirstSum: num(buyers.rows[0]?.first_sum),
    buyersAgreed: num(buyers.rows[0]?.agreed),
    orders: num(orders.rows[0]?.n),
    books: num(orders.rows[0]?.books),
  };
}

/**
 * Всё для страницы «Прибыль»: деньги (те же строки, что в «Финансах» — каждая сумма один раз) и расходы за период вместе
 * с прошлым — для сравнения; счётчики заявок, покупателей и заказов — по обоим периодам.
 */
export async function profitReport(range: { from: Date; to: Date; first: string; last: string; prev: { from: Date; to: Date; first: string; last: string } }) {
  const [money, expenses, counts, prevCounts] = await Promise.all([
    financeMoney(range.prev.from < range.from ? range.prev.from : range.from, range.to),
    expenseRows(range.prev.first < range.first ? range.prev.first : range.first, range.last),
    profitCounts(range.from, range.to),
    profitCounts(range.prev.from, range.prev.to),
  ]);
  return { money, expenses, counts, prevCounts };
}
