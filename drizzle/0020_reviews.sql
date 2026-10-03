CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"author_name" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"photo" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"theme" text NOT NULL,
	"thank_you_code" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_idx" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status","featured");--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'reviews.manage') WHERE "key" IN ('owner','support') AND NOT ('reviews.manage' = ANY("permissions"));