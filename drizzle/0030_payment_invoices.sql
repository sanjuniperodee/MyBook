CREATE TABLE "payment_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"method" text NOT NULL,
	"external_id" text NOT NULL,
	"phone" text,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_status" text,
	"checkout_url" text,
	"qr_token" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_invoices_external_idx" ON "payment_invoices" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "payment_invoices_target_idx" ON "payment_invoices" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_invoices_status_idx" ON "payment_invoices" USING btree ("status","created_at");