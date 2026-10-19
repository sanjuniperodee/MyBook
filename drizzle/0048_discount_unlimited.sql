-- Продавать ниже прайса без лимита скидки раньше мог тот, кто удаляет сделки (deals.delete). Теперь это отдельное право —
-- выдаём его тем же ролям, чтобы никто ничего не потерял. Системная роль из них — только «Руководитель» (у него и так все
-- права); вторая строка — роли, которые завели в CRM и дали им «Удалять сделки».
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'prices.discount_unlimited') WHERE "key" IN ('owner') AND NOT ('prices.discount_unlimited' = ANY("permissions"));--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'prices.discount_unlimited') WHERE 'deals.delete' = ANY("permissions") AND NOT ('prices.discount_unlimited' = ANY("permissions"));
