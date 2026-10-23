ALTER TABLE "crm_tasks" ADD COLUMN "overdue_notified_at" timestamp with time zone;--> statement-breakpoint
-- Уже просроченные к выкатке задачи — как будто о них сказали: иначе первый проход завалил бы уведомлениями.
UPDATE "crm_tasks" SET "overdue_notified_at" = now() WHERE "done_at" IS NULL AND "due_at" < now();
