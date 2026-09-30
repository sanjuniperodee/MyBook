CREATE TABLE "crm_link_clicks" (
	"link_id" uuid NOT NULL,
	"day" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "crm_link_clicks_link_id_day_pk" PRIMARY KEY("link_id","day")
);
--> statement-breakpoint
CREATE TABLE "crm_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'site' NOT NULL,
	"target_path" text DEFAULT '/' NOT NULL,
	"wa_text" text DEFAULT '' NOT NULL,
	"utm_source" text NOT NULL,
	"utm_medium" text DEFAULT '' NOT NULL,
	"utm_campaign" text DEFAULT '' NOT NULL,
	"utm_content" text DEFAULT '' NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "utm" jsonb;--> statement-breakpoint
ALTER TABLE "crm_link_clicks" ADD CONSTRAINT "crm_link_clicks_link_id_crm_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."crm_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_links" ADD CONSTRAINT "crm_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Источник у уже существующих сделок клиентов с сайта — из профиля клиента.
UPDATE "crm_deals" d SET "utm" = u."source" FROM "users" u WHERE d."client_id" = u."id" AND d."utm" IS NULL AND u."source" IS NOT NULL;
