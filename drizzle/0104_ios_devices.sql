CREATE TABLE "crm_ios_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"udid" text NOT NULL,
	"product" text DEFAULT '' NOT NULL,
	"ios_version" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_ios_devices_udid_unique" UNIQUE("udid")
);
--> statement-breakpoint
ALTER TABLE "crm_ios_devices" ADD CONSTRAINT "crm_ios_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_ios_devices_user_idx" ON "crm_ios_devices" USING btree ("user_id");