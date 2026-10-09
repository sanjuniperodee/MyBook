ALTER TABLE "books" ADD COLUMN "cover_photo_extra" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "back_photo_extra" jsonb DEFAULT '[]'::jsonb NOT NULL;