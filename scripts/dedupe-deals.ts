// Разовая чистка дублей сделок: npm run dedupe:deals            — только показать, что будет сделано
//                               npm run dedupe:deals -- --apply — выполнить
// 1) «Пустая» заявка клиента (из чата, звонка, сайта: без заказа, денег, тарифа и суммы) вливается в его настоящую
//    сделку — слияние CRM (переписка, звонки, задачи, лента переходят, деньги не теряются).
// 2) Заявка без клиента, но с номером, который есть ровно у одного аккаунта, и без сделки-цели — привязывается к аккаунту.
// 3) Открытая «пустая» сделка с сайта после выигранной сделки заказа (в окне слияния) вливается в выигранную.
import { sql } from "drizzle-orm";
import { container } from "../src/server/container";
import { pool } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";

const apply = process.argv.includes("--apply");
const c = container();

type Row = { id: string; number: number; title: string; client_id: string | null; uid: string | null; target_id: string | null; target_number: number | null; kind: "merge" | "link" | "won" };

/** «Пустые» открытые заявки + куда их влить: открытая сделка с договорённостью того же клиента (или номера). */
const { rows } = await executor().execute<Row>(sql`
  with req as (
    select d.id, d.number, d.title, d.client_id, d.created_at, right(regexp_replace(coalesce(d.contact_phone,''),'\\D','','g'),10) as ph
    from crm_deals d join crm_stages s on s.id = d.stage_id
    where s.kind = 'open' and d.order_id is null and d.agreed_plan is null and d.amount = 0
      and not exists (select 1 from crm_payments p where p.deal_id = d.id)
      and not exists (select 1 from crm_receipts r where r.deal_id = d.id)
  ), owner as (
    select req.*, coalesce(req.client_id, (select (array_agg(u.id))[1] from users u where length(req.ph) = 10 and right(regexp_replace(coalesce(u.phone,''),'\\D','','g'),10) = req.ph having count(*) = 1)) as uid from req
  )
  select o.id, o.number, o.title, o.client_id, o.uid::text as uid,
         t.id as target_id, t.number as target_number,
         case when t.id is not null then 'merge' else 'link' end as kind
  from owner o
  left join lateral (
    select d2.id, d2.number from crm_deals d2 join crm_stages s2 on s2.id = d2.stage_id
    where s2.kind = 'open' and d2.id <> o.id and d2.client_id = o.uid and (d2.amount > 0 or d2.agreed_plan is not null or d2.order_id is not null
      or exists (select 1 from crm_payments p2 where p2.deal_id = d2.id))
    order by d2.created_at desc limit 1
  ) t on true
  where o.uid is not null and (t.id is not null or o.client_id is null)
  order by o.number
`);

const won = await executor().execute<Row>(sql`
  select d.id, d.number, d.title, d.client_id, d.client_id::text as uid, t.id as target_id, t.number as target_number, 'won' as kind
  from crm_deals d join crm_stages s on s.id = d.stage_id
  join lateral (select w.id, w.number from crm_deals w join crm_stages sw on sw.id = w.stage_id where sw.kind = 'won' and w.client_id = d.client_id and w.order_id is not null order by w.created_at desc limit 1) t on true
  where s.kind = 'open' and d.source = 'site' and d.order_id is null and d.agreed_plan is null and d.amount = 0
    and not exists (select 1 from crm_payments p where p.deal_id = d.id)
`);

let done = 0;
for (const r of [...rows, ...won.rows]) {
  const text = r.kind === "link" ? `привязать к клиенту ${r.uid}` : `влить в №${r.target_number}`;
  console.log(`№${r.number} «${r.title}» → ${text}${apply ? "" : " (пробный проход)"}`);
  if (!apply) continue;
  try {
    if (r.kind === "link") {
      await c.sales.deals.linkClient(r.id, r.uid!);
      await c.messaging.chats.linkDealClient(r.id, r.uid!);
    } else {
      await c.sales.deals.merge(r.target_id!, r.id, null);
    }
    done++;
  } catch (err) {
    console.error(`  ✗ №${r.number}: ${err instanceof Error ? err.message : err}`);
  }
}
console.log(apply ? `Готово: обработано ${done} из ${rows.length + won.rows.length}` : `Найдено ${rows.length + won.rows.length}. Запустите с --apply, чтобы выполнить.`);
await pool.end();
