ALTER TABLE "crm_deals" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "route_tried" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
CREATE INDEX "crm_deals_assigned_idx" ON "crm_deals" USING btree ("assigned_at");--> statement-breakpoint
-- Уже назначенные сделки: время назначения неизвестно — считаем от создания (очередь круга и «нет ответа» по ним не сработают задним числом: они уже не в «Неразобранном» или давно).
UPDATE "crm_deals" SET "assigned_at" = "created_at" WHERE "assignee_id" IS NOT NULL;
--> statement-breakpoint
-- Чат идёт за сделкой: у диалогов сделки — ответственный сделки (раньше при передаче сделки чат оставался у прежнего).
UPDATE "crm_conversations" c SET "assignee_id" = d."assignee_id" FROM "crm_deals" d WHERE c."deal_id" = d."id" AND d."assignee_id" IS NOT NULL AND c."assignee_id" IS DISTINCT FROM d."assignee_id";
