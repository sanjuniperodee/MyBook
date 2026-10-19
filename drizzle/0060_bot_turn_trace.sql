-- След хода AI-продажника (P0-11, bots-1): «Почему так?» у ответа бота в чате. meta — что решила модель и что сделал код,
-- message_id — последнее сообщение клиенту в этом ходе. Одна строка на ход; старше 90 дней чистит проход планировщика.
ALTER TABLE "crm_bot_events" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "crm_bot_events" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_bot_events" ADD CONSTRAINT "crm_bot_events_message_id_crm_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."crm_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_bot_events_message_idx" ON "crm_bot_events" USING btree ("message_id") WHERE "crm_bot_events"."message_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_bot_events_turn_at_idx" ON "crm_bot_events" USING btree ("created_at") WHERE "crm_bot_events"."kind" = 'turn';
