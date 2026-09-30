ALTER TABLE "books" ADD COLUMN "language" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "locale" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "buyer_locale" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'ru' NOT NULL;