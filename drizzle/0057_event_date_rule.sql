-- «Успеть к дате» (P0-9, deals-28, automation-5): открытые сделки с «Датой события» в ближайшие N дней — диапазоном
-- по тексту ГГГГ-ММ-ДД в поле сделки, без прохода по всем сделкам (медленный проход правил, раз в 30 минут).
CREATE INDEX "crm_deals_event_date_idx" ON "crm_deals" USING btree (("custom_fields"->>'event_date')) WHERE ("crm_deals"."custom_fields"->>'event_date') is not null;--> statement-breakpoint
-- Стартовое правило выключено (решение владельца: руководитель включает сам). Клиенту не пишет — только задача
-- ответственному по сделке: за 10 дней до даты события по сделке ничего не оплачено. Порог заполненности книги и число
-- дней правят в «Автоматизациях». В рабочее время: задача и уведомление — не ночью.
INSERT INTO "crm_automations" ("name", "trigger", "conditions", "actions", "active")
SELECT 'Успеть к дате: не оплачено → задача', 'deal.event_date_near', '{"daysBefore": 10, "unpaid": 1, "hours": "work"}'::jsonb,
  '[{"type": "create_task", "title": "Успеть к {дата}: по сделке ничего не оплачено — связаться с {имя}", "dueMinutes": 120}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM "crm_automations" WHERE "trigger" = 'deal.event_date_near');
