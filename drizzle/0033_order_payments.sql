CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"external_ref" text,
	"paid_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"receipt_storage_key" text,
	"receipt_file_name" text,
	"receipt_mime" text,
	"receipt_size" integer,
	"created_by_id" uuid,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "postpay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "received_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_payments_paid_idx" ON "order_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_external_idx" ON "order_payments" USING btree ("method","external_ref") WHERE "order_payments"."external_ref" is not null;--> statement-breakpoint
-- Уже оплаченные через Kaspi заказы — в журнал денег (по операции счёта Kaspi). Ручные подтверждения без денег остаются без записи:
-- в заказе видно «нет чека — прикрепите оплату».
INSERT INTO "order_payments" ("order_id", "amount", "method", "external_ref", "paid_at", "note")
SELECT pi."target_id", pi."amount", 'kaspi', pi."external_id", COALESCE(pi."paid_at", pi."updated_at"), 'Kaspi (перенесено из счетов Kaspi)'
FROM "payment_invoices" pi JOIN "orders" o ON o."id" = pi."target_id"
WHERE pi."target_kind" = 'order' AND pi."status" = 'paid'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "orders" o SET "received_amount" = s."total" FROM (SELECT "order_id", SUM("amount")::int AS "total" FROM "order_payments" GROUP BY "order_id") s WHERE s."order_id" = o."id";
