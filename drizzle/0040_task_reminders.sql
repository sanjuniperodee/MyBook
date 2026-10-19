ALTER TABLE "crm_tasks" ADD COLUMN "remind_before_min" integer;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "reminded_at" timestamp with time zone;