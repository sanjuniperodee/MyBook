CREATE TABLE "job_pulses" (
	"job" text PRIMARY KEY NOT NULL,
	"every_sec" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"duration_ms" integer,
	"ok_at" timestamp with time zone,
	"error" text,
	"error_at" timestamp with time zone,
	"fails" integer DEFAULT 0 NOT NULL,
	"runs" bigint DEFAULT 0 NOT NULL,
	"failures" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_alerts" (
	"stream" text PRIMARY KEY NOT NULL,
	"down_since" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "crm_messages_pending_idx" ON "crm_messages" USING btree ("created_at") WHERE "crm_messages"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "crm_messages_untranscribed_idx" ON "crm_messages" USING btree ("created_at") WHERE "crm_messages"."type" = 'audio' and "crm_messages"."transcript" is null and "crm_messages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."processed_at" is null;