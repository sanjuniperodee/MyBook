CREATE TABLE "landing_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"landing" text NOT NULL,
	"utm_source" text DEFAULT '' NOT NULL,
	"utm_medium" text DEFAULT '' NOT NULL,
	"utm_campaign" text DEFAULT '' NOT NULL,
	"utm_content" text DEFAULT '' NOT NULL,
	"utm_term" text DEFAULT '' NOT NULL,
	"fbclid" text DEFAULT '' NOT NULL,
	"fbp" text DEFAULT '' NOT NULL,
	"fbc" text DEFAULT '' NOT NULL,
	"campaign_id" text DEFAULT '' NOT NULL,
	"adset_id" text DEFAULT '' NOT NULL,
	"ad_id" text DEFAULT '' NOT NULL,
	"placement" text DEFAULT '' NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"in_app" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clicked_at" timestamp with time zone,
	"conversation_id" uuid,
	"match" text,
	"matched_at" timestamp with time zone,
	CONSTRAINT "landing_visits_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "landing_visits" ADD CONSTRAINT "landing_visits_conversation_id_crm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "landing_visits_free_click_idx" ON "landing_visits" USING btree ("clicked_at") WHERE "landing_visits"."conversation_id" is null;