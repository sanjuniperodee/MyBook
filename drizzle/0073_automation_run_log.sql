ALTER TABLE "crm_automation_runs" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_automation_runs" ADD COLUMN "details" jsonb;--> statement-breakpoint
CREATE INDEX "crm_auto_runs_rule_time_idx" ON "crm_automation_runs" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_auto_runs_deferred_idx" ON "crm_automation_runs" USING btree ("created_at") WHERE "crm_automation_runs"."status" = 'deferred';--> statement-breakpoint
CREATE INDEX "crm_auto_runs_details_idx" ON "crm_automation_runs" USING btree ("created_at") WHERE "crm_automation_runs"."details" is not null;