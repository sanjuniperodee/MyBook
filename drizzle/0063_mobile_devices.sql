CREATE TABLE "crm_mobile_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_mobile_devices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "crm_mobile_devices" ADD CONSTRAINT "crm_mobile_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_mobile_devices_user_idx" ON "crm_mobile_devices" USING btree ("user_id");