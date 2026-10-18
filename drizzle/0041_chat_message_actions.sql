ALTER TABLE "crm_messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "forwarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "transcript" text;