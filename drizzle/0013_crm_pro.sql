CREATE TABLE "crm_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"direction" text NOT NULL,
	"client_phone" text DEFAULT '' NOT NULL,
	"extension" text,
	"staff_id" uuid,
	"client_id" uuid,
	"deal_id" uuid,
	"status" text DEFAULT 'ringing' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"has_recording" boolean DEFAULT false NOT NULL,
	"recording_ref" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"channel_id" text DEFAULT '' NOT NULL,
	"chat_id" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"client_id" uuid,
	"deal_id" uuid,
	"assignee_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"unread" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_text" text DEFAULT '' NOT NULL,
	"awaiting_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"stage_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"client_id" uuid,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"assignee_id" uuid,
	"order_id" uuid,
	"lost_reason" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_id" uuid,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"author_id" uuid,
	"type" text DEFAULT 'text' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media_url" text,
	"external_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_messages_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "crm_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "crm_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#9a8f86' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_notes" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "kind" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "crm_role_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sip_extension" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_audit" ADD CONSTRAINT "crm_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_automation_id_crm_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."crm_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_calls" ADD CONSTRAINT "crm_calls_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_calls" ADD CONSTRAINT "crm_calls_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_calls" ADD CONSTRAINT "crm_calls_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_conversation_id_crm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_settings" ADD CONSTRAINT "crm_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_audit_created_idx" ON "crm_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_audit_entity_idx" ON "crm_audit" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_auto_runs_idx" ON "crm_automation_runs" USING btree ("automation_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_calls_ext_idx" ON "crm_calls" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "crm_calls_started_idx" ON "crm_calls" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "crm_calls_phone_idx" ON "crm_calls" USING btree ("client_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_conv_chat_idx" ON "crm_conversations" USING btree ("channel","channel_id","chat_id");--> statement-breakpoint
CREATE INDEX "crm_conv_last_idx" ON "crm_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_assignee_idx" ON "crm_deals" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "crm_deals_client_idx" ON "crm_deals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "crm_messages_conv_idx" ON "crm_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_notif_user_idx" ON "crm_notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_crm_role_id_crm_roles_id_fk" FOREIGN KEY ("crm_role_id") REFERENCES "public"."crm_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_notes_deal_idx" ON "crm_notes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "users_manager_idx" ON "users" USING btree ("manager_id");--> statement-breakpoint
-- Начальные данные CRM: системные роли, этапы воронки, быстрые ответы, базовые автоматизации.
INSERT INTO "crm_roles" ("key","name","scope","permissions") VALUES ('owner','Руководитель','all',ARRAY['deals.view','deals.edit','deals.delete','chats.view','chats.send','calls.view','calls.make','calls.recordings','clients.view','clients.edit','clients.contacts','clients.export','orders.view','orders.edit','orders.files','tasks.all','promo.manage','gifts.manage','analytics.view','team.manage','settings.manage','audit.view']::text[]) ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crm_roles" ("key","name","scope","permissions") VALUES ('manager','Менеджер продаж','own',ARRAY['deals.view','deals.edit','chats.view','chats.send','calls.view','calls.make','calls.recordings','clients.view','clients.edit','clients.contacts','orders.view']::text[]) ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crm_roles" ("key","name","scope","permissions") VALUES ('production','Производство','all',ARRAY['orders.view','orders.edit','orders.files','clients.view','clients.contacts','gifts.manage']::text[]) ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crm_roles" ("key","name","scope","permissions") VALUES ('support','Поддержка','all',ARRAY['deals.view','chats.view','chats.send','calls.view','calls.make','clients.view','clients.contacts','orders.view']::text[]) ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crm_stages" ("name","color","position","kind") VALUES ('Новая заявка','#6b8fb5',0,'open');
--> statement-breakpoint
INSERT INTO "crm_stages" ("name","color","position","kind") VALUES ('Взяли в работу','#d19a4a',1,'open');
--> statement-breakpoint
INSERT INTO "crm_stages" ("name","color","position","kind") VALUES ('Пишет книгу','#8a6fb0',2,'open');
--> statement-breakpoint
INSERT INTO "crm_stages" ("name","color","position","kind") VALUES ('Готова к заказу','#4f9a8a',3,'open');
--> statement-breakpoint
INSERT INTO "crm_stages" ("name","color","position","kind") VALUES ('Заказ оформлен','#3f8f4f',4,'won');
--> statement-breakpoint
INSERT INTO "crm_stages" ("name","color","position","kind") VALUES ('Отказ','#b5545c',5,'lost');
--> statement-breakpoint
INSERT INTO "crm_templates" ("title","text","position") VALUES ('Приветствие','Здравствуйте, {имя}! Это MyBooks. Чем можем помочь?',0);
--> statement-breakpoint
INSERT INTO "crm_templates" ("title","text","position") VALUES ('Как начать книгу','{имя}, начать просто: зарегистрируйтесь на сайте, выберите, кому книга, и отвечайте на вопросы в своём темпе — всё сохраняется автоматически. Писать можно бесплатно, платите, когда книга готова.',1);
--> statement-breakpoint
INSERT INTO "crm_templates" ("title","text","position") VALUES ('Сроки и доставка','Производство занимает 5–7 рабочих дней (тариф «Премиум» — 3–4). Курьером по Алматы и Астане — 1–2 дня, по Казахстану — 3–7 дней.',2);
--> statement-breakpoint
INSERT INTO "crm_templates" ("title","text","position") VALUES ('Ссылка на заказ','{имя}, ваш заказ {заказ}: {ссылка}',3);
--> statement-breakpoint
INSERT INTO "crm_automations" ("name","trigger","conditions","actions") VALUES ('Пропущенный звонок → задача перезвонить','call.missed','{}'::jsonb,'[{"type": "create_task", "title": "Перезвонить: пропущенный звонок", "dueMinutes": 15}]'::jsonb);
--> statement-breakpoint
INSERT INTO "crm_automations" ("name","trigger","conditions","actions") VALUES ('Новая заявка → распределить по кругу','deal.created','{}'::jsonb,'[{"type": "assign", "userId": null}]'::jsonb);
--> statement-breakpoint
INSERT INTO "crm_automations" ("name","trigger","conditions","actions") VALUES ('Клиент ждёт ответа 15 минут → напомнить ответственному','message.unanswered','{"minutes": 15}'::jsonb,'[{"type": "notify", "title": "Клиент ждёт ответа больше 15 минут"}]'::jsonb);
