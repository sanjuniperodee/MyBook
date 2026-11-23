-- Отмена ошибочного платежа заказа руководителем (voided_*: платёж остаётся в журнале, но не считается в деньгах), хэш чека (receipt_sha256, crm_receipts.sha256: один чек — не ко второму платежу) и права «Менять цену оплаченного заказа» и «Отменять ошибочные платежи» у роли «Руководитель».
ALTER TABLE "order_payments" ADD COLUMN "receipt_sha256" text;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "voided_by_id" uuid;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "crm_receipts" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_payments_receipt_sha_idx" ON "order_payments" USING btree ("receipt_sha256") WHERE "order_payments"."receipt_sha256" is not null;--> statement-breakpoint
CREATE INDEX "crm_receipts_sha_idx" ON "crm_receipts" USING btree ("sha256") WHERE "crm_receipts"."sha256" is not null;--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'orders.reprice_paid') WHERE "key" IN ('owner') AND NOT ('orders.reprice_paid' = ANY("permissions"));--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'orders.payment_void') WHERE "key" IN ('owner') AND NOT ('orders.payment_void' = ANY("permissions"));
