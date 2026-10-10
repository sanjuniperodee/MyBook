import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

/** Поступления денег за период для выгрузки: журнал revenue_events с клиентом, менеджером и признаком «чек приложен». */
export async function paymentsExport(days: number) {
  const r = await executor().execute<{ at: Date; amount: number; kind: string; type: string; ref: string; client: string; phone: string; manager: string; receipt: string }>(sql`
    select to_char(e.at at time zone 'Asia/Almaty', 'YYYY-MM-DD HH24:MI') as at, e.amount, e.kind,
      case when e.kind = 'payment' then (select case p.kind when 'prepayment' then 'предоплата' else 'платёж' end from crm_payments p where p.id = e.ref_id) else '' end as type,
      coalesce((select '№' || o.number from orders o where o.id = e.sale_id and e.kind = 'order'), '') ||
        case when e.deal_id is not null then ' сделка №' || (select d.number from crm_deals d where d.id = e.deal_id) else '' end as ref,
      coalesce(nullif(u.name, ''), u.email, '') as client, coalesce(u.phone, '') as phone, coalesce(m.name, '') as manager,
      case when e.kind <> 'payment' then '' when exists (select 1 from crm_receipts r where r.deal_id = e.deal_id) then 'да' else 'нет' end as receipt
    from revenue_events e left join users u on u.id = e.client_id left join users m on m.id = e.manager_id
    where e.at >= now() - make_interval(days => ${days}) order by e.at desc limit 50000`);
  return r.rows;
}
