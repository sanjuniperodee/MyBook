CREATE TABLE "answer_file_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"minutes" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"source_mime" text DEFAULT '' NOT NULL,
	"source_bytes" integer NOT NULL,
	"received_bytes" integer DEFAULT 0 NOT NULL,
	"declared_sec" integer,
	"duration_sec" integer,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"has_poster" boolean DEFAULT false NOT NULL,
	"error" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_file_purchases" ADD CONSTRAINT "answer_file_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_file_purchases" ADD CONSTRAINT "answer_file_purchases_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_files" ADD CONSTRAINT "answer_files_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_files" ADD CONSTRAINT "answer_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_file_purchases_number_idx" ON "answer_file_purchases" USING btree ("number");--> statement-breakpoint
CREATE INDEX "answer_file_purchases_book_idx" ON "answer_file_purchases" USING btree ("book_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "answer_files_token_idx" ON "answer_files" USING btree ("token");--> statement-breakpoint
CREATE INDEX "answer_files_book_idx" ON "answer_files" USING btree ("book_id","created_at");--> statement-breakpoint
CREATE INDEX "answer_files_status_idx" ON "answer_files" USING btree ("status","created_at");