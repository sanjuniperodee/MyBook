ALTER TABLE "crm_deals" ADD COLUMN "repeat_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Бэкфилл (deals-24): сколько покупок было у клиента до создания сделки — выигранные раньше сделки и оплаченные раньше
-- заказы, у которых нет своей выигранной сделки (покупка из чата с заказом — одна).
UPDATE "crm_deals" d SET "repeat_count" = least(99, (
  (select count(*) from "crm_deals" p join "crm_stages" s on s.id = p.stage_id
    where p.client_id = d.client_id and p.id <> d.id and s.kind = 'won' and coalesce(p.closed_at, p.stage_changed_at) < d.created_at)
  + (select count(*) from "orders" o
    where o.user_id = d.client_id and o.paid_at is not null and o.status <> 'cancelled' and o.paid_at < d.created_at
      and (d.order_id is null or o.id <> d.order_id)
      and not exists (select 1 from "crm_deals" x join "crm_stages" xs on xs.id = x.stage_id where x.order_id = o.id and xs.kind = 'won' and x.id <> d.id))
))
WHERE d.client_id is not null;
