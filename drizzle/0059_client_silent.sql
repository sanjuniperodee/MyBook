-- «Клиент молчит после нашего ответа» (P0-10, automation-6): последний ответ человека в диалоге — из CRM или с телефона
-- магазина (эхо); бот, правила и внутренние заметки его не двигают.
ALTER TABLE "crm_conversations" ADD COLUMN "last_outgoing_at" timestamp with time zone;--> statement-breakpoint
-- Бэкфилл одним проходом по сообщениям: ответ человека — исходящее без source (из CRM с автором или эхо), не заметка.
UPDATE "crm_conversations" c SET "last_outgoing_at" = m.at
FROM (
  SELECT "conversation_id", max("created_at") AS at FROM "crm_messages"
  WHERE "direction" = 'out' AND NOT "internal" AND "source" IS NULL
  GROUP BY "conversation_id"
) m
WHERE m."conversation_id" = c."id";--> statement-breakpoint
CREATE INDEX "crm_conv_last_out_idx" ON "crm_conversations" USING btree ("last_outgoing_at") WHERE "crm_conversations"."last_outgoing_at" is not null;--> statement-breakpoint
-- Стартовое правило выключено (решение владельца: руководитель включает сам). Клиенту не пишет — задача ответственному:
-- клиент сутки молчит после нашего ответа, в рабочее время. Часы правят в «Автоматизациях». Задача «написать» закрывается
-- сама, когда менеджер ответит клиенту (из CRM или с телефона магазина).
INSERT INTO "crm_automations" ("name", "trigger", "conditions", "actions", "active")
SELECT 'Клиент молчит сутки после нашего ответа → задача', 'message.silent', '{"silentHours": 24, "hours": "work"}'::jsonb,
  '[{"type": "create_task", "title": "Напомнить о себе: {имя} молчит после нашего ответа", "dueMinutes": 120}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM "crm_automations" WHERE "trigger" = 'message.silent');
