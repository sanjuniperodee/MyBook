ALTER TABLE "design_ai_requests" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "design_ai_requests" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "design_ai_requests" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "design_ai_requests" ADD COLUMN "ms" integer;--> statement-breakpoint
ALTER TABLE "design_ai_requests" ADD COLUMN "polish" text;--> statement-breakpoint
CREATE INDEX "design_ai_requests_created_idx" ON "design_ai_requests" USING btree ("created_at");