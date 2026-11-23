-- Ключ отправки формы ручного платежа: повтор той же отправки после сбоя (письмо, журнал) — тот же платёж, а не второй
ALTER TABLE "order_payments" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "request_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_request_key_idx" ON "order_payments" USING btree ("request_key") WHERE "order_payments"."request_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_payments_request_key_idx" ON "crm_payments" USING btree ("request_key") WHERE "crm_payments"."request_key" is not null;