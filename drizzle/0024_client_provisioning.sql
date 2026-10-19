-- Менеджеры продаж заводят клиентов сами: новое право «Заводить клиентов и выдавать им доступ».
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'clients.create') WHERE "key" IN ('owner','manager') AND NOT ('clients.create' = ANY("permissions"));--> statement-breakpoint
-- Предоплата по сделке: сумма, о которой договорились, — это «Сумма» сделки, а полученная часть — поле «Предоплата».
INSERT INTO "crm_fields" ("entity", "key", "label", "type", "position") SELECT 'deal', 'prepaid', 'Предоплата, ₸', 'number', COALESCE(MAX("position"), 0) + 1 FROM "crm_fields" WHERE "entity" = 'deal' ON CONFLICT ("entity", "key") DO NOTHING;
