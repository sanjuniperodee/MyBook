ALTER TABLE "orders" ADD COLUMN "prepaid_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Журнал выручки v2. Заказ, оформленный по договорённости, хранит в amount только «к оплате» (за вычетом предоплаты),
-- поэтому платежи менеджера считаются всегда — двойного счёта нет. Возвраты клиенту — платежи типа refund, в выручке со знаком минус.
CREATE OR REPLACE VIEW "revenue_events" AS
  SELECT o."paid_at" AS "at", o."amount" AS "amount", 'order'::text AS "kind", o."user_id" AS "client_id", d."id" AS "deal_id", COALESCE(d."assignee_id", o."assignee_id") AS "manager_id", o."plan" AS "plan", o."id" AS "sale_id", o."id" AS "ref_id"
  FROM "orders" o LEFT JOIN "crm_deals" d ON d."order_id" = o."id"
  WHERE o."paid_at" IS NOT NULL AND o."status" <> 'cancelled'
  UNION ALL
  SELECT p."paid_at", CASE WHEN p."kind" = 'refund' THEN -p."amount" ELSE p."amount" END, CASE WHEN p."kind" = 'refund' THEN 'refund' ELSE 'payment' END::text, COALESCE(p."client_id", d."client_id"), p."deal_id", d."assignee_id", 'manual'::text, COALESCE(d."order_id", p."deal_id"), p."id"
  FROM "crm_payments" p JOIN "crm_deals" d ON d."id" = p."deal_id"
  UNION ALL
  SELECT d."closed_at", d."amount", 'deal'::text, d."client_id", d."id", d."assignee_id", 'manual'::text, d."id", d."id"
  FROM "crm_deals" d JOIN "crm_stages" s ON s."id" = d."stage_id"
  WHERE s."kind" = 'won' AND d."order_id" IS NULL AND d."closed_at" IS NOT NULL AND d."amount" > 0
    AND NOT EXISTS (SELECT 1 FROM "crm_payments" p WHERE p."deal_id" = d."id");
