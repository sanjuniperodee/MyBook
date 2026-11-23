-- Каталог WhatsApp Business: копия товаров каталога номера магазина (wa_catalog_products) и карточки товаров/корзин в переписке (crm_messages.card).
CREATE TABLE "wa_catalog_products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"retailer_id" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"review" text DEFAULT '' NOT NULL,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_key" text,
	"image_source" text,
	"position" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "card" jsonb;--> statement-breakpoint
CREATE INDEX "wa_catalog_products_position_idx" ON "wa_catalog_products" USING btree ("position");--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'catalog.manage') WHERE "key" IN ('owner','manager') AND NOT ('catalog.manage' = ANY("permissions"));