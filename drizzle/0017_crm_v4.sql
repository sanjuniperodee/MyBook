ALTER TABLE "crm_conversations" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "ai_summary" jsonb;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_backup" text[] DEFAULT '{}'::text[] NOT NULL;