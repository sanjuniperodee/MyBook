-- Окно и суточный лимит сообщений клиентам от правил автоматизаций (automation-15): перед отправкой считаем, сколько
-- сообщений правил ушло за местные сутки. Частичный индекс — только сообщения правил клиентам (без заметок), счёт идёт
-- по нему и не обходит всю переписку. Сами окно и лимит — настройки whatsapp.rulesWindow и whatsapp.rulesDailyLimit
-- («Интеграции» → «Мессенджеры»), по умолчанию 09:00–21:00 и 40 в сутки.
CREATE INDEX "crm_messages_rule_idx" ON "crm_messages" USING btree ("created_at") WHERE "crm_messages"."source" = 'rule' and "crm_messages"."internal" = false;
