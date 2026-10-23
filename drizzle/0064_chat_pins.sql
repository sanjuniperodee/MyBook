CREATE TABLE "crm_pinned_chats" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_pinned_chats" ADD CONSTRAINT "crm_pinned_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pinned_chats" ADD CONSTRAINT "crm_pinned_chats_conversation_id_crm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pinned_chats_pk" ON "crm_pinned_chats" USING btree ("user_id","conversation_id");