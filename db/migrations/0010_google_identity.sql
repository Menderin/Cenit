CREATE TABLE "cenit"."google_authorizations" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "google_authorizations_email_unique" UNIQUE("email"),
	CONSTRAINT "google_authorization_email" CHECK (length("cenit"."google_authorizations"."email") BETWEEN 3 AND 254 AND "cenit"."google_authorizations"."email" = lower(btrim("cenit"."google_authorizations"."email")) AND "cenit"."google_authorizations"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
--> statement-breakpoint
CREATE TABLE "cenit"."google_challenges" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"nonce_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"account_id" uuid,
	"session_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "google_challenge_hashes" CHECK ("cenit"."google_challenges"."token_hash" ~ '^[0-9a-f]{64}$' AND "cenit"."google_challenges"."nonce_hash" ~ '^[0-9a-f]{64}$' AND ("cenit"."google_challenges"."session_hash" IS NULL OR "cenit"."google_challenges"."session_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "google_challenge_purpose" CHECK (("cenit"."google_challenges"."purpose" = 'login' AND "cenit"."google_challenges"."account_id" IS NULL) OR ("cenit"."google_challenges"."purpose" = 'link' AND "cenit"."google_challenges"."account_id" IS NOT NULL AND "cenit"."google_challenges"."session_hash" IS NOT NULL)),
	CONSTRAINT "google_challenge_duration" CHECK ("cenit"."google_challenges"."expires_at" = "cenit"."google_challenges"."created_at" + interval '5 minutes')
);
--> statement-breakpoint
CREATE TABLE "cenit"."google_identities" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_identities_subject_unique" UNIQUE("subject"),
	CONSTRAINT "google_identity_subject" CHECK ("cenit"."google_identities"."subject" ~ '^[A-Za-z0-9_-]{1,255}$')
);
--> statement-breakpoint
ALTER TABLE "cenit"."sessions" ADD COLUMN "authentication_method" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "cenit"."google_authorizations" ADD CONSTRAINT "google_authorizations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."google_challenges" ADD CONSTRAINT "google_challenges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."google_identities" ADD CONSTRAINT "google_identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_challenge_expiration" ON "cenit"."google_challenges" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "cenit"."sessions" ADD CONSTRAINT "session_authentication_method" CHECK ("cenit"."sessions"."authentication_method" IN ('local','google'));