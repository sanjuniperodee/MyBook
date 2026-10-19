CREATE TABLE "crm_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"client_id" uuid,
	"amount" integer NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_receipts" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_payments_deal_idx" ON "crm_payments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_payments_paid_idx" ON "crm_payments" USING btree ("paid_at");--> statement-breakpoint
ALTER TABLE "crm_receipts" ADD CONSTRAINT "crm_receipts_payment_id_crm_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."crm_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_amount_positive" CHECK ("amount" > 0);--> statement-breakpoint
-- Предоплата раньше хранилась полем сделки «Предоплата»: переносим в платежи и убираем поле — деньги живут только в журнале.
INSERT INTO "crm_payments" ("deal_id", "client_id", "amount", "kind", "paid_at", "created_by_id") SELECT d."id", d."client_id", (d."custom_fields"->>'prepaid')::int, 'prepayment', d."created_at", d."created_by_id" FROM "crm_deals" d WHERE (d."custom_fields"->>'prepaid') ~ '^[0-9]{1,9}$' AND (d."custom_fields"->>'prepaid')::int > 0;--> statement-breakpoint
UPDATE "crm_receipts" r SET "payment_id" = (SELECT p."id" FROM "crm_payments" p WHERE p."deal_id" = r."deal_id" ORDER BY p."paid_at" LIMIT 1) WHERE r."payment_id" IS NULL AND (SELECT count(*) FROM "crm_payments" p WHERE p."deal_id" = r."deal_id") = 1;--> statement-breakpoint
UPDATE "crm_deals" SET "custom_fields" = "custom_fields" - 'prepaid' WHERE "custom_fields" ? 'prepaid';--> statement-breakpoint
DELETE FROM "crm_fields" WHERE "entity" = 'deal' AND "key" = 'prepaid';--> statement-breakpoint
-- Единый журнал выручки: оплаченные заказы, платежи по сделкам без заказа и успешные сделки без заказа и платежей
-- (продали в чате и оплатили переводом). Обзор, аналитика, планы, LTV клиентов и каналы читают его — так цифры везде совпадают.
CREATE OR REPLACE VIEW "revenue_events" AS
  SELECT o."paid_at" AS "at", o."amount" AS "amount", 'order'::text AS "kind", o."user_id" AS "client_id", d."id" AS "deal_id", COALESCE(d."assignee_id", o."assignee_id") AS "manager_id", o."plan" AS "plan", o."id" AS "sale_id", o."id" AS "ref_id"
  FROM "orders" o LEFT JOIN "crm_deals" d ON d."order_id" = o."id"
  WHERE o."paid_at" IS NOT NULL AND o."status" <> 'cancelled'
  UNION ALL
  SELECT p."paid_at", p."amount", 'payment'::text, COALESCE(p."client_id", d."client_id"), p."deal_id", d."assignee_id", 'manual'::text, p."deal_id", p."id"
  FROM "crm_payments" p JOIN "crm_deals" d ON d."id" = p."deal_id"
  WHERE d."order_id" IS NULL
  UNION ALL
  SELECT d."closed_at", d."amount", 'deal'::text, d."client_id", d."id", d."assignee_id", 'manual'::text, d."id", d."id"
  FROM "crm_deals" d JOIN "crm_stages" s ON s."id" = d."stage_id"
  WHERE s."kind" = 'won' AND d."order_id" IS NULL AND d."closed_at" IS NOT NULL AND d."amount" > 0
    AND NOT EXISTS (SELECT 1 FROM "crm_payments" p WHERE p."deal_id" = d."id");
