CREATE TABLE "crm_bot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"deal_id" uuid,
	"kind" text NOT NULL,
	"field" text,
	"intent" text,
	"lang" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD COLUMN "bot_state" jsonb;--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD COLUMN "bot_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "crm_bot_events" ADD CONSTRAINT "crm_bot_events_conversation_id_crm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_bot_events" ADD CONSTRAINT "crm_bot_events_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_bot_events_at_idx" ON "crm_bot_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_bot_events_conv_idx" ON "crm_bot_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "crm_conv_bot_due_idx" ON "crm_conversations" USING btree ("bot_due_at") WHERE "crm_conversations"."bot_due_at" is not null;