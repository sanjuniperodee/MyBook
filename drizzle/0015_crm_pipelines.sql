CREATE TABLE "crm_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_plans" (
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"deals" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_plans_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "crm_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "crm_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity" text DEFAULT 'deals' NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD COLUMN "bot_step" integer;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD COLUMN "pipeline_id" uuid;--> statement-breakpoint
-- Все существующие этапы — в основную воронку «Продажи».
INSERT INTO "crm_pipelines" ("name","position") VALUES ('Продажи', 0);--> statement-breakpoint
UPDATE "crm_stages" SET "pipeline_id" = (SELECT "id" FROM "crm_pipelines" ORDER BY "position", "created_at" LIMIT 1);--> statement-breakpoint
ALTER TABLE "crm_stages" ALTER COLUMN "pipeline_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_plans" ADD CONSTRAINT "crm_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_push_subscriptions" ADD CONSTRAINT "crm_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_views" ADD CONSTRAINT "crm_saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_from_stage_id_crm_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."crm_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_to_stage_id_crm_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."crm_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_fields_key_idx" ON "crm_fields" USING btree ("entity","key");--> statement-breakpoint
CREATE INDEX "crm_push_user_idx" ON "crm_push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_views_user_idx" ON "crm_saved_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_stage_hist_deal_idx" ON "crm_stage_history" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_stage_hist_to_idx" ON "crm_stage_history" USING btree ("to_stage_id","created_at");--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- История этапов для уже существующих сделок: текущий этап с даты создания.
INSERT INTO "crm_stage_history" ("deal_id","to_stage_id","created_at") SELECT "id", "stage_id", "created_at" FROM "crm_deals";
--> statement-breakpoint
-- Свои поля сделки по умолчанию: повод, дата события, для кого, формат (заполняются из книги клиента и ботом).
INSERT INTO "crm_fields" ("entity","key","label","type","options","position") VALUES
  ('deal','occasion','Повод','select',ARRAY['Годовщина','День рождения','14 февраля','8 марта','Новый год','Свадьба','Юбилей родителей','Выпускной','Другой повод']::text[],1),
  ('deal','event_date','Дата события','date','{}'::text[],2),
  ('deal','recipient','Для кого','text','{}'::text[],3),
  ('deal','format','Формат','select',ARRAY['Печатная','Электронная','Пока не знает']::text[],4)
ON CONFLICT DO NOTHING;
