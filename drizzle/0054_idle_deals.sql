-- «Сделка без активности» (P0-10, automation-4, deals-21): кандидаты — открытые этапы, где этап давно не менялся
-- (этап + смена этапа вместо одного этапа), последняя активность — по задачам и звонкам сделки (медленный проход
-- правил, раз в 30 минут).
DROP INDEX "crm_deals_stage_idx";--> statement-breakpoint
CREATE INDEX "crm_tasks_deal_idx" ON "crm_tasks" USING btree ("deal_id") WHERE "crm_tasks"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_calls_deal_idx" ON "crm_calls" USING btree ("deal_id") WHERE "crm_calls"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("stage_id","stage_changed_at");--> statement-breakpoint
-- Стартовое правило выключено (решение владельца: руководитель включает сам). Клиенту не пишет — только задача
-- ответственному по сделке: 3 дня ничего не было, не больше 20 сделок в день, в рабочее время. Дни, этап и лимит в день
-- правят в «Автоматизациях».
INSERT INTO "crm_automations" ("name", "trigger", "conditions", "actions", "active")
SELECT 'Забытая сделка: 3 дня без активности → задача', 'deal.idle', '{"days": 3, "perDay": 20, "hours": "work"}'::jsonb,
  '[{"type": "create_task", "title": "Связаться с {имя}: по сделке ничего не происходит с {дата}", "dueMinutes": 120}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM "crm_automations" WHERE "trigger" = 'deal.idle');
