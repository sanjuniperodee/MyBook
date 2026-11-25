ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "purged_at" timestamp with time zone;