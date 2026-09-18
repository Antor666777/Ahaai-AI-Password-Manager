CREATE TABLE "item_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"name_enc" text NOT NULL,
	"notes_enc" text,
	"data_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_revisions" ADD CONSTRAINT "item_revisions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_revisions" ADD CONSTRAINT "item_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_revisions_item_revision_key" ON "item_revisions" USING btree ("item_id","revision");--> statement-breakpoint
CREATE INDEX "item_revisions_user_id_idx" ON "item_revisions" USING btree ("user_id");