-- Обращения: проблемы и просьбы с формы /support; номер называют в чате и коммите.
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"kind" text DEFAULT 'bug' NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"expected" text DEFAULT '' NOT NULL,
	"reporter_name" text DEFAULT '' NOT NULL,
	"notify_phone" text DEFAULT '' NOT NULL,
	"client_phone" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chat" jsonb,
	"summary" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"dev_note" text DEFAULT '' NOT NULL,
	"commits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"processed_attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"notify_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_number_idx" ON "support_tickets" USING btree ("number");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","created_at");