ALTER TABLE "orders" ADD COLUMN "addons" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "addons_amount" integer DEFAULT 0 NOT NULL;