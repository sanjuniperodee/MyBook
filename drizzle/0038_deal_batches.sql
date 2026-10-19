ALTER TABLE "crm_deals" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "batch_index" integer;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "batch_size" integer;