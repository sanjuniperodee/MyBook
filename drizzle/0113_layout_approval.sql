ALTER TABLE "orders" ADD COLUMN "layout_approval_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "layout_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "layout_approved_fingerprint" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "layout_approval_revoked_at" timestamp with time zone;--> statement-breakpoint
-- Согласование макета клиентом (27.11.2026): нужно печатным заказам, которые ещё не ушли в печать. Заказы в печати,
-- отправленные, выданные и отменённые — без требования, их файлы выдаются как раньше.
UPDATE "orders" SET "layout_approval_required" = true WHERE "plan" IN ('hardcover', 'premium') AND "status" IN ('pending_payment', 'paid');
