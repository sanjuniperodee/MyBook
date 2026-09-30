CREATE TABLE "crm_blocklist" (
	"value" text PRIMARY KEY NOT NULL,
	"reason" text DEFAULT 'spam' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "unsorted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "extra_phones" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD COLUMN "milestone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "on_shift" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "extra_phones" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_blocklist" ADD CONSTRAINT "crm_blocklist_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Право «персональная скидка из чата» — руководителю и менеджерам продаж.
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'promo.give') WHERE "key" IN ('owner','manager') AND NOT ('promo.give' = ANY("permissions"));
--> statement-breakpoint
-- Воронка по действиям клиента: начал книгу → «Пишет книгу», 25+ ответов → «Готова к заказу», заказ → «успех».
UPDATE "crm_stages" SET "milestone" = 'book_started' WHERE "kind" = 'open' AND "name" = 'Пишет книгу' AND "milestone" IS NULL;
--> statement-breakpoint
UPDATE "crm_stages" SET "milestone" = 'book_ready' WHERE "kind" = 'open' AND "name" = 'Готова к заказу' AND "milestone" IS NULL;
--> statement-breakpoint
UPDATE "crm_stages" SET "milestone" = 'order_created' WHERE "id" = (SELECT "id" FROM "crm_stages" WHERE "kind" = 'won' ORDER BY "position" LIMIT 1) AND "milestone" IS NULL;
--> statement-breakpoint
INSERT INTO "crm_automations" ("name","trigger","conditions","actions") VALUES ('Клиент 5 дней не заходит → задача подтолкнуть','client.inactive','{"days": 5}'::jsonb,'[{"type": "create_task", "title": "Подтолкнуть {имя}: 5 дней не заходит в книгу", "dueMinutes": 240}]'::jsonb);
--> statement-breakpoint
INSERT INTO "crm_automations" ("name","trigger","conditions","actions") VALUES ('Годовщина повода → повторная продажа','occasion.anniversary','{"daysBefore": 30}'::jsonb,'[{"type": "create_deal", "title": "Годовщина: {повод} — вторая книга"}, {"type": "create_task", "title": "Предложить книгу к годовщине ({дата}): {имя}", "dueMinutes": 1440}]'::jsonb);
--> statement-breakpoint
INSERT INTO "crm_automations" ("name","trigger","conditions","actions","active") VALUES ('Вне рабочего времени → автоответ','message.incoming','{"hours": "off"}'::jsonb,'[{"type": "send_message", "text": "Здравствуйте, {имя}! Сейчас мы не на связи — ответим в рабочее время. А пока можно начать книгу: {ссылка}"}]'::jsonb,false);
--> statement-breakpoint
INSERT INTO "crm_templates" ("title","text","position") VALUES ('Годовщина','Здравствуйте, {имя}! Год назад вы дарили книгу — «{повод}». Скоро снова этот день: хотите, сделаем вторую часть или книгу для кого-то ещё? Для вас приготовили скидку 🙂',5);
