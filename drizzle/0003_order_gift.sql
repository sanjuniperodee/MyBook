ALTER TABLE "orders" ADD COLUMN "gift_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "desired_date" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "surprise" boolean DEFAULT false NOT NULL;