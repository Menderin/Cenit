CREATE TABLE "cenit"."google_identities" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"authorized" boolean DEFAULT true NOT NULL,
	"google_sub" text,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_identities_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "google_identity_sub" CHECK ("cenit"."google_identities"."google_sub" IS NULL OR (length("cenit"."google_identities"."google_sub") BETWEEN 1 AND 255 AND "cenit"."google_identities"."google_sub" = btrim("cenit"."google_identities"."google_sub") AND "cenit"."google_identities"."google_sub" ~ '^[A-Za-z0-9._-]+$')),
	CONSTRAINT "google_identity_link_state" CHECK (("cenit"."google_identities"."google_sub" IS NULL) = ("cenit"."google_identities"."linked_at" IS NULL)),
	CONSTRAINT "google_identity_dates" CHECK ("cenit"."google_identities"."updated_at" >= "cenit"."google_identities"."authorized_at" AND ("cenit"."google_identities"."linked_at" IS NULL OR "cenit"."google_identities"."linked_at" >= "cenit"."google_identities"."authorized_at"))
);
--> statement-breakpoint
ALTER TABLE "cenit"."google_identities" ADD CONSTRAINT "google_identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;