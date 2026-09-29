CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"token" text NOT NULL,
	"plan" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_provider" text NOT NULL,
	"payment_id" text,
	"payment_claimed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"buyer_user_id" uuid,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_phone" text DEFAULT '' NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text,
	"message" text DEFAULT '' NOT NULL,
	"send_at" text,
	"sent_at" timestamp with time zone,
	"promo_code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_number_idx" ON "gift_cards" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_token_idx" ON "gift_cards" USING btree ("token");--> statement-breakpoint
CREATE INDEX "gift_cards_status_idx" ON "gift_cards" USING btree ("status");