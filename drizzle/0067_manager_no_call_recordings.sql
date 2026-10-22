-- Записи разговоров (АТС и звонки WhatsApp из CRM) слушает руководитель: у системной роли «Менеджер продаж» право снято (выдать можно в «Команде»).
UPDATE "crm_roles" SET "permissions" = array_remove("permissions", 'calls.recordings') WHERE "key" IN ('manager');
