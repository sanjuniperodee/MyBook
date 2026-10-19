ALTER TABLE "crm_deals" ADD COLUMN "agreed_gifts" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_invoices" ADD COLUMN "gifts" text[] DEFAULT '{}'::text[] NOT NULL;