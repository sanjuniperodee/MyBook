ALTER TABLE "gift_cards" ADD COLUMN "receipt_storage_key" text;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "receipt_file_name" text;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "receipt_mime" text;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "receipt_size" integer;