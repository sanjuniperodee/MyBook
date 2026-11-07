CREATE TABLE "finance_issue_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"href" text,
	"manager_id" uuid,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_by_id" uuid,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "kind" text DEFAULT 'payment' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_issue_resolutions" ADD CONSTRAINT "finance_issue_resolutions_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_issue_resolutions" ADD CONSTRAINT "finance_issue_resolutions_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_issue_resolutions" ADD CONSTRAINT "finance_issue_resolutions_undone_by_id_users_id_fk" FOREIGN KEY ("undone_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_issue_resolutions_active_idx" ON "finance_issue_resolutions" USING btree ("key","amount") WHERE "finance_issue_resolutions"."undone_at" is null;--> statement-breakpoint
CREATE INDEX "finance_issue_resolutions_resolved_idx" ON "finance_issue_resolutions" USING btree ("resolved_at");