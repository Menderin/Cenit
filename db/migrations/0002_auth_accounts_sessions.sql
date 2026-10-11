CREATE TABLE "cenit"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "account_email" CHECK (length("cenit"."accounts"."email") BETWEEN 3 AND 254 AND "cenit"."accounts"."email" = lower(btrim("cenit"."accounts"."email")) AND "cenit"."accounts"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
	CONSTRAINT "account_name" CHECK (length("cenit"."accounts"."name") BETWEEN 1 AND 200 AND length(btrim("cenit"."accounts"."name")) > 0),
	CONSTRAINT "account_role" CHECK ("cenit"."accounts"."role" IN ('docente','estudiante','administrativo')),
	CONSTRAINT "account_password_hash" CHECK ("cenit"."accounts"."password_hash" ~ '^scrypt-v1\$131072\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$'),
	CONSTRAINT "account_dates" CHECK ("cenit"."accounts"."updated_at" >= "cenit"."accounts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "cenit"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "session_hash" CHECK ("cenit"."sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "session_duration" CHECK ("cenit"."sessions"."expires_at" = "cenit"."sessions"."created_at" + interval '2 hours'),
	CONSTRAINT "session_revocation" CHECK ("cenit"."sessions"."revoked_at" IS NULL OR "cenit"."sessions"."revoked_at" >= "cenit"."sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "cenit"."sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_account" ON "cenit"."sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "session_expiration" ON "cenit"."sessions" USING btree ("expires_at");
