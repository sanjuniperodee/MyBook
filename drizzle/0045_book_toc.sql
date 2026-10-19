ALTER TABLE "books" ADD COLUMN "toc_mode" text DEFAULT 'chapters' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "toc_lines" jsonb DEFAULT '{}'::jsonb NOT NULL;