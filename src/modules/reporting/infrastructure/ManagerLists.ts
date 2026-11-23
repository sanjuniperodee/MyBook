import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { crmDeals, crmStages } from "@/shared/infrastructure/db/schema";
import { crmDealsClientId, crmDealsId } from "@/shared/infrastructure/db/refs";
import { executor } from "@/shared/infrastructure/database";
import { progressCols, readySql } from "@/shared/infrastructure/db/bookProgress";
import { MANAGER_LIST_KEYS, PAID_STALLED_DAYS, PAY_TALK_PATTERN, PAY_TALK_QUIET_HOURS, TALKING_HOURS, type ManagerListKey } from "../ui/managerLists";
import { visibleTo, type Viewer } from "./conditions";

/** Принято денег по сделке (возвраты вычтены). */
const paid = sql`coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = ${crmDealsId}), 0)`;
/** Книга клиента сделки «почти готова» (как полоска в CRM и готовность к заказу), а заказа по ней нет. */
const readyBookNoOrder = sql`exists (select 1 from books b where b.user_id = ${crmDealsClientId}
  and ${readySql({ theme: sql`b.theme`, ...progressCols(sql`b.id`) })}
  and not exists (select 1 from orders o where o.book_id = b.id and o.status <> 'cancelled'))`;

/**
 * Условие списка для выборки из crm_deals (без псевдонима): сделка открыта (этап kind = open — его добавляет вызывающий),
 * не «неразобранная». Одно условие — и для фильтра сделок `?list=`, и для числа на «Моём дне».
 */
export function managerListWhere(key: ManagerListKey): SQL {
  const base = sql`not ${crmDeals.unsorted}`;
  switch (key) {
    case "pay_talk":
      return sql`${base} and ${paid} <= 0 and ${crmDeals.orderId} is null
        and exists (select 1 from (
          select m.text from crm_messages m join crm_conversations c on c.id = m.conversation_id
          where c.deal_id = ${crmDealsId} and not m.internal order by m.created_at desc limit 4) x where x.text ~* ${PAY_TALK_PATTERN})
        and (select max(m.created_at) from crm_messages m join crm_conversations c on c.id = m.conversation_id where c.deal_id = ${crmDealsId} and not m.internal)
          < now() - make_interval(hours => ${PAY_TALK_QUIET_HOURS})`;
    case "talking":
      return sql`${base} and ${paid} <= 0 and ${crmDeals.orderId} is null
        and exists (select 1 from crm_messages m join crm_conversations c on c.id = m.conversation_id
          where c.deal_id = ${crmDealsId} and m.direction = 'in' and not m.internal and m.created_at > now() - make_interval(hours => ${TALKING_HOURS}))`;
    case "book_ready":
      return sql`${base} and ${crmDeals.orderId} is null and ${readyBookNoOrder}`;
    case "paid_stalled":
      // Движение книги — правка книги или любого ответа; книги ещё нет — считаем от первой оплаты.
      return sql`${base} and ${paid} > 0 and ${crmDeals.orderId} is null and not ${readyBookNoOrder}
        and coalesce(
          (select greatest(max(b.updated_at), max(q.updated_at)) from books b left join book_questions q on q.book_id = b.id where b.user_id = ${crmDealsClientId}),
          (select min(p.paid_at) from crm_payments p where p.deal_id = ${crmDealsId})
        ) < now() - make_interval(days => ${PAID_STALLED_DAYS})`;
  }
}

/** Сколько сделок в каждом списке — для «Моего дня»; видимость — как у сделок («только свои» — свои и ничьи). */
export async function managerListCounts(viewer: Viewer): Promise<Record<ManagerListKey, number>> {
  const scope = visibleTo(viewer, crmDeals.assigneeId);
  const [row] = await executor()
    .select(Object.fromEntries(MANAGER_LIST_KEYS.map((k) => [k, sql<number>`(count(*) filter (where ${managerListWhere(k)}))::int`])) as Record<ManagerListKey, SQL<number>>)
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(and(eq(crmStages.kind, "open"), scope));
  return Object.fromEntries(MANAGER_LIST_KEYS.map((k) => [k, Number(row?.[k] ?? 0)])) as Record<ManagerListKey, number>;
}
