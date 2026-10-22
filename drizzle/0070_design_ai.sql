CREATE TABLE "design_ai_credits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_ai_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"requests" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"target" text NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'free' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"ops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_ai_credits" ADD CONSTRAINT "design_ai_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_ai_purchases" ADD CONSTRAINT "design_ai_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_ai_requests" ADD CONSTRAINT "design_ai_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_ai_requests" ADD CONSTRAINT "design_ai_requests_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "design_ai_purchases_number_idx" ON "design_ai_purchases" USING btree ("number");--> statement-breakpoint
CREATE INDEX "design_ai_purchases_user_idx" ON "design_ai_purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "design_ai_requests_user_idx" ON "design_ai_requests" USING btree ("user_id","created_at");