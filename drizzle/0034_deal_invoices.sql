CREATE TABLE "deal_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"token" text NOT NULL,
	"deal_id" uuid NOT NULL,
	"conversation_id" uuid,
	"phone" text,
	"client_name" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"plan" text NOT NULL,
	"agreed_total" integer NOT NULL,
	"amount" integer NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"paid_method" text,
	"paid_ref" text,
	"paid_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"closed_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_by_id" uuid,
	"access_status" text DEFAULT 'none' NOT NULL,
	"access_user_id" uuid,
	"access_message_id" uuid,
	"access_attempted_at" timestamp with time zone,
	"issue_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "purpose" text DEFAULT 'reset' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "method" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deal_invoices" ADD CONSTRAINT "deal_invoices_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_invoices" ADD CONSTRAINT "deal_invoices_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_invoices" ADD CONSTRAINT "deal_invoices_access_user_id_users_id_fk" FOREIGN KEY ("access_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_invoices_number_idx" ON "deal_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_invoices_token_idx" ON "deal_invoices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "deal_invoices_deal_idx" ON "deal_invoices" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_invoices_open_idx" ON "deal_invoices" USING btree ("deal_id") WHERE "deal_invoices"."status" = 'pending_payment';--> statement-breakpoint
CREATE UNIQUE INDEX "deal_invoices_issue_key_idx" ON "deal_invoices" USING btree ("issue_key") WHERE "deal_invoices"."issue_key" is not null;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_payments_external_idx" ON "crm_payments" USING btree ("method","external_ref") WHERE "crm_payments"."external_ref" is not null;