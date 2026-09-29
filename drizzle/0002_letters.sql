CREATE TABLE "book_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"relation" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "book_letters" ADD CONSTRAINT "book_letters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_letters_book_idx" ON "book_letters" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_invite_token_idx" ON "books" USING btree ("invite_token");