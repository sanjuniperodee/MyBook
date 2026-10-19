-- Менеджер продаж больше не видит полных номеров: вместо «видеть контакты полностью» — «открыть номер своего клиента» (с журналом).
UPDATE "crm_roles" SET "permissions" = array_remove("permissions", 'clients.contacts') WHERE "key" IN ('manager');--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'clients.reveal') WHERE "key" IN ('manager', 'owner') AND NOT ('clients.reveal' = ANY("permissions"));--> statement-breakpoint
-- Номер в текстах, которые видят все (заголовки сделок и задач, имя контакта без имени, уведомления, системные записи): только «…4567».
UPDATE "crm_deals" SET "title" = regexp_replace("title", '\+7 \d{3} \d{3} (\d{2}) (\d{2})', '…\1\2', 'g') WHERE "title" ~ '\+7 \d{3} \d{3} \d{2} \d{2}';--> statement-breakpoint
UPDATE "crm_deals" SET "contact_name" = regexp_replace("contact_name", '\+7 \d{3} \d{3} (\d{2}) (\d{2})', '…\1\2', 'g') WHERE "contact_name" ~ '\+7 \d{3} \d{3} \d{2} \d{2}';--> statement-breakpoint
UPDATE "crm_tasks" SET "title" = regexp_replace("title", '\+7 \d{3} \d{3} (\d{2}) (\d{2})', '…\1\2', 'g') WHERE "title" ~ '\+7 \d{3} \d{3} \d{2} \d{2}';--> statement-breakpoint
UPDATE "crm_notifications" SET "title" = regexp_replace("title", '\+7 \d{3} \d{3} (\d{2}) (\d{2})', '…\1\2', 'g'), "body" = regexp_replace("body", '\+7 \d{3} \d{3} (\d{2}) (\d{2})', '…\1\2', 'g')
WHERE "title" ~ '\+7 \d{3} \d{3} \d{2} \d{2}' OR "body" ~ '\+7 \d{3} \d{3} \d{2} \d{2}';--> statement-breakpoint
UPDATE "crm_notes" SET "text" = regexp_replace("text", '\+7 \d{3} \d{3} (\d{2}) (\d{2})', '…\1\2', 'g') WHERE "kind" = 'system' AND "text" ~ '\+7 \d{3} \d{3} \d{2} \d{2}';
