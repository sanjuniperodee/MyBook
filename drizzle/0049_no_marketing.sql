-- Стоп-лист: кроме спама — «не писать первым» (no_marketing): входящие как обычно, но бот не напоминает о себе и
-- правила не пишут. Почему номер в списке — note (слова сотрудника или фраза клиента). Кто добавил — created_by_id,
-- как и раньше (null — CRM сама). До этой миграции в reason писался только spam; на всякий случай всё прочее — спам.
ALTER TABLE "crm_blocklist" ADD COLUMN "note" text;--> statement-breakpoint
UPDATE "crm_blocklist" SET "reason" = 'spam' WHERE "reason" NOT IN ('spam', 'no_marketing');--> statement-breakpoint
ALTER TABLE "crm_blocklist" ADD CONSTRAINT "crm_blocklist_reason_check" CHECK ("crm_blocklist"."reason" in ('spam', 'no_marketing'));
