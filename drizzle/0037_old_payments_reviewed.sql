-- Решение владельца (17.10): ручные платежи, принятые до появления «Финансы → Проверить», считаются проверенными —
-- в списке на проверку остаются только новые. Миграция выполняется при деплое, поэтому «до» — это всё, что есть в базе.
UPDATE "crm_payments" SET "reviewed_at" = now() WHERE "method" = 'manual' AND "reviewed_at" IS NULL;--> statement-breakpoint
UPDATE "order_payments" SET "reviewed_at" = now() WHERE "method" = 'manual' AND "reviewed_at" IS NULL;
