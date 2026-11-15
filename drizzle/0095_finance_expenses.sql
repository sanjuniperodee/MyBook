CREATE TABLE "finance_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"quantity" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_expenses_day_idx" ON "finance_expenses" USING btree ("day");--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'finance.view') WHERE "key" IN ('owner') AND NOT ('finance.view' = ANY("permissions"));--> statement-breakpoint
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'finance.manage') WHERE "key" IN ('owner') AND NOT ('finance.manage' = ANY("permissions"));
