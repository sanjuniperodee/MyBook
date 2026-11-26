CREATE TABLE "crm_ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"quote" text,
	"message_id" uuid,
	"confidence" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "ai_stage_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD COLUMN "by_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD COLUMN "ai_reason" text;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_ai_proposals" ADD CONSTRAINT "crm_ai_proposals_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_ai_proposals" ADD CONSTRAINT "crm_ai_proposals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_ai_proposals_deal_idx" ON "crm_ai_proposals" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_ai_proposals_pending_idx" ON "crm_ai_proposals" USING btree ("created_at") WHERE "crm_ai_proposals"."status" = 'pending';