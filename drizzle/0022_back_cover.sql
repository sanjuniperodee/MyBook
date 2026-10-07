ALTER TABLE "books" ADD COLUMN "back_layout" text DEFAULT 'quote' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "back_photo_id" uuid;