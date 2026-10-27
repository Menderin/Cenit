CREATE TABLE "cenit"."purchase_sheets_delivery" (
	"spreadsheet_id" text NOT NULL,
	"purchase_id" uuid NOT NULL,
	"header_row" integer,
	"item_rows" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"synced_generation" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "purchase_sheets_delivery_spreadsheet_id_purchase_id_pk" PRIMARY KEY("spreadsheet_id","purchase_id"),
	CONSTRAINT "purchase_sheets_header_row" UNIQUE("spreadsheet_id","header_row"),
	CONSTRAINT "purchase_sheets_delivery_values" CHECK ("cenit"."purchase_sheets_delivery"."synced_generation" >= 0 AND "cenit"."purchase_sheets_delivery"."attempts" >= 0 AND ("cenit"."purchase_sheets_delivery"."header_row" IS NULL OR "cenit"."purchase_sheets_delivery"."header_row" >= 2))
);
--> statement-breakpoint
CREATE TABLE "cenit"."purchase_sheets_outbox" (
	"purchase_id" uuid PRIMARY KEY NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "purchase_sheets_generation" CHECK ("cenit"."purchase_sheets_outbox"."generation" > 0)
);

--> statement-breakpoint
INSERT INTO "cenit"."purchase_sheets_outbox" ("purchase_id")
SELECT "id" FROM "cenit"."purchase_requests" ON CONFLICT DO NOTHING;
