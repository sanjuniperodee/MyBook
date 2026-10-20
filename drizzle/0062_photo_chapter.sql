ALTER TABLE "photos" ADD COLUMN "chapter" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "opener" boolean DEFAULT false NOT NULL;