-- Выборки правил по времени (automation-d4): «клиенту не ответили N минут» идёт каждую минуту — ждущие ответа
-- по частичному индексу, дольше всех ждущие первыми. Сработавшие объекты выборка исключает по crm_auto_runs_idx.
CREATE INDEX "crm_conv_awaiting_idx" ON "crm_conversations" USING btree ("awaiting_since") WHERE "crm_conversations"."awaiting_since" is not null;
