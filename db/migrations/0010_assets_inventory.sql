CREATE TABLE "cenit"."asset_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"number" integer NOT NULL,
	"delivered_on" date NOT NULL,
	"receiver_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"destination" text,
	"giver_name" text NOT NULL,
	"giver_position" text,
	"giver_unit" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_delivery_operation" UNIQUE("created_by","operation_id"),
	CONSTRAINT "asset_delivery_number" UNIQUE("year","number"),
	CONSTRAINT "asset_delivery_folio" CHECK ("cenit"."asset_deliveries"."number" > 0 AND "cenit"."asset_deliveries"."year" = extract(year FROM "cenit"."asset_deliveries"."delivered_on")),
	CONSTRAINT "asset_delivery_reason" CHECK (length("cenit"."asset_deliveries"."reason") BETWEEN 1 AND 500 AND "cenit"."asset_deliveries"."reason" ~ '[^[:space:]]'),
	CONSTRAINT "asset_delivery_giver" CHECK (length("cenit"."asset_deliveries"."giver_name") BETWEEN 1 AND 200 AND "cenit"."asset_deliveries"."giver_name" ~ '[^[:space:]]'),
	CONSTRAINT "asset_delivery_notes" CHECK ("cenit"."asset_deliveries"."notes" IS NULL OR (length("cenit"."asset_deliveries"."notes") BETWEEN 1 AND 1000 AND "cenit"."asset_deliveries"."notes" ~ '[^[:space:]]')),
	CONSTRAINT "asset_delivery_text_0" CHECK ("cenit"."asset_deliveries"."destination" IS NULL OR (length("cenit"."asset_deliveries"."destination") BETWEEN 1 AND 255 AND "cenit"."asset_deliveries"."destination" ~ '[^[:space:]]')),
	CONSTRAINT "asset_delivery_text_1" CHECK ("cenit"."asset_deliveries"."giver_position" IS NULL OR (length("cenit"."asset_deliveries"."giver_position") BETWEEN 1 AND 255 AND "cenit"."asset_deliveries"."giver_position" ~ '[^[:space:]]')),
	CONSTRAINT "asset_delivery_text_2" CHECK ("cenit"."asset_deliveries"."giver_unit" IS NULL OR (length("cenit"."asset_deliveries"."giver_unit") BETWEEN 1 AND 255 AND "cenit"."asset_deliveries"."giver_unit" ~ '[^[:space:]]'))
);
--> statement-breakpoint
CREATE TABLE "cenit"."asset_delivery_items" (
	"delivery_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "asset_delivery_items_delivery_id_position_pk" PRIMARY KEY("delivery_id","position"),
	CONSTRAINT "asset_delivery_item" UNIQUE("delivery_id","asset_id"),
	CONSTRAINT "asset_delivery_item_position" CHECK ("cenit"."asset_delivery_items"."position" BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "cenit"."asset_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"person_id" uuid,
	"location_from" text,
	"location_to" text,
	"note" text,
	"delivery_id" uuid,
	"loan_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_event_kind" CHECK ("cenit"."asset_events"."kind" IN ('alta','entrega','prestamo','devolucion','ubicacion','edicion')),
	CONSTRAINT "asset_event_links" CHECK (("cenit"."asset_events"."kind" = 'entrega') = ("cenit"."asset_events"."delivery_id" IS NOT NULL) AND ("cenit"."asset_events"."kind" IN ('prestamo','devolucion')) = ("cenit"."asset_events"."loan_id" IS NOT NULL)),
	CONSTRAINT "asset_event_note" CHECK ("cenit"."asset_events"."note" IS NULL OR (length("cenit"."asset_events"."note") BETWEEN 1 AND 1000 AND "cenit"."asset_events"."note" ~ '[^[:space:]]')),
	CONSTRAINT "asset_event_location_from" CHECK ("cenit"."asset_events"."location_from" IS NULL OR (length("cenit"."asset_events"."location_from") BETWEEN 1 AND 255 AND "cenit"."asset_events"."location_from" ~ '[^[:space:]]')),
	CONSTRAINT "asset_event_location_to" CHECK ("cenit"."asset_events"."location_to" IS NULL OR (length("cenit"."asset_events"."location_to") BETWEEN 1 AND 255 AND "cenit"."asset_events"."location_to" ~ '[^[:space:]]'))
);
--> statement-breakpoint
CREATE TABLE "cenit"."asset_loan_items" (
	"loan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "asset_loan_items_loan_id_position_pk" PRIMARY KEY("loan_id","position"),
	CONSTRAINT "asset_loan_item" UNIQUE("loan_id","asset_id"),
	CONSTRAINT "asset_loan_item_position" CHECK ("cenit"."asset_loan_items"."position" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "cenit"."asset_loans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"number" integer NOT NULL,
	"loaned_on" date NOT NULL,
	"due_on" date,
	"borrower_id" uuid NOT NULL,
	"location" text,
	"authorizer_name" text NOT NULL,
	"authorizer_unit" text,
	"notes" text,
	"returned_on" date,
	"return_note" text,
	"returned_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_loan_operation" UNIQUE("created_by","operation_id"),
	CONSTRAINT "asset_loan_number" UNIQUE("year","number"),
	CONSTRAINT "asset_loan_folio" CHECK ("cenit"."asset_loans"."number" > 0 AND "cenit"."asset_loans"."year" = extract(year FROM "cenit"."asset_loans"."loaned_on")),
	CONSTRAINT "asset_loan_dates" CHECK (("cenit"."asset_loans"."due_on" IS NULL OR "cenit"."asset_loans"."due_on" >= "cenit"."asset_loans"."loaned_on") AND ("cenit"."asset_loans"."returned_on" IS NULL OR "cenit"."asset_loans"."returned_on" >= "cenit"."asset_loans"."loaned_on")),
	CONSTRAINT "asset_loan_return" CHECK (("cenit"."asset_loans"."returned_on" IS NULL AND "cenit"."asset_loans"."returned_by" IS NULL AND "cenit"."asset_loans"."return_note" IS NULL) OR ("cenit"."asset_loans"."returned_on" IS NOT NULL AND "cenit"."asset_loans"."returned_by" IS NOT NULL)),
	CONSTRAINT "asset_loan_authorizer" CHECK (length("cenit"."asset_loans"."authorizer_name") BETWEEN 1 AND 200 AND "cenit"."asset_loans"."authorizer_name" ~ '[^[:space:]]'),
	CONSTRAINT "asset_loan_notes" CHECK ("cenit"."asset_loans"."notes" IS NULL OR (length("cenit"."asset_loans"."notes") BETWEEN 1 AND 1000 AND "cenit"."asset_loans"."notes" ~ '[^[:space:]]')),
	CONSTRAINT "asset_loan_return_note" CHECK ("cenit"."asset_loans"."return_note" IS NULL OR (length("cenit"."asset_loans"."return_note") BETWEEN 1 AND 500 AND "cenit"."asset_loans"."return_note" ~ '[^[:space:]]')),
	CONSTRAINT "asset_loan_text_0" CHECK ("cenit"."asset_loans"."location" IS NULL OR (length("cenit"."asset_loans"."location") BETWEEN 1 AND 255 AND "cenit"."asset_loans"."location" ~ '[^[:space:]]')),
	CONSTRAINT "asset_loan_text_1" CHECK ("cenit"."asset_loans"."authorizer_unit" IS NULL OR (length("cenit"."asset_loans"."authorizer_unit") BETWEEN 1 AND 255 AND "cenit"."asset_loans"."authorizer_unit" ~ '[^[:space:]]'))
);
--> statement-breakpoint
CREATE TABLE "cenit"."asset_people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rut" text,
	"unit" text,
	"position" text,
	"active" boolean DEFAULT true NOT NULL,
	"inactive_since" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_person_name" CHECK (length("cenit"."asset_people"."name") BETWEEN 1 AND 200 AND "cenit"."asset_people"."name" ~ '[^[:space:]]'),
	CONSTRAINT "asset_person_rut" CHECK ("cenit"."asset_people"."rut" IS NULL OR (length("cenit"."asset_people"."rut") BETWEEN 1 AND 20 AND "cenit"."asset_people"."rut" ~ '[^[:space:]]')),
	CONSTRAINT "asset_person_unit" CHECK ("cenit"."asset_people"."unit" IS NULL OR (length("cenit"."asset_people"."unit") BETWEEN 1 AND 255 AND "cenit"."asset_people"."unit" ~ '[^[:space:]]')),
	CONSTRAINT "asset_person_position" CHECK ("cenit"."asset_people"."position" IS NULL OR (length("cenit"."asset_people"."position") BETWEEN 1 AND 255 AND "cenit"."asset_people"."position" ~ '[^[:space:]]')),
	CONSTRAINT "asset_person_status" CHECK (("cenit"."asset_people"."active" AND "cenit"."asset_people"."inactive_since" IS NULL) OR (NOT "cenit"."asset_people"."active" AND "cenit"."asset_people"."inactive_since" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cenit"."assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "cenit"."assets_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"operation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"inventory_number" text,
	"brand" text,
	"model" text,
	"serial_number" text,
	"furniture_type" text,
	"material" text,
	"dimensions" text,
	"area" text,
	"system_part" boolean DEFAULT false NOT NULL,
	"wall_mounted" boolean DEFAULT false NOT NULL,
	"assembled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"location" text NOT NULL,
	"custodian_id" uuid,
	"purchase_id" uuid,
	"registered_on" date NOT NULL,
	"search_text" text GENERATED ALWAYS AS (cenit.normalize_purchase_search(description || ' ' || coalesce(inventory_number, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(serial_number, '') || ' ' || location || ' ' || coalesce(material, '') || ' ' || coalesce(furniture_type, ''))) STORED,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_number_unique" UNIQUE("number"),
	CONSTRAINT "asset_operation" UNIQUE("created_by","operation_id"),
	CONSTRAINT "asset_kind" CHECK ("cenit"."assets"."kind" IN ('equipo_computacional','equipo','mueble','maquinaria','construccion','accesorio','otro')),
	CONSTRAINT "asset_quantity" CHECK ("cenit"."assets"."quantity" BETWEEN 1 AND 9999),
	CONSTRAINT "asset_version" CHECK ("cenit"."assets"."version" > 0),
	CONSTRAINT "asset_description" CHECK (length("cenit"."assets"."description") BETWEEN 1 AND 500 AND "cenit"."assets"."description" ~ '[^[:space:]]'),
	CONSTRAINT "asset_location" CHECK (length("cenit"."assets"."location") BETWEEN 1 AND 255 AND "cenit"."assets"."location" ~ '[^[:space:]]'),
	CONSTRAINT "asset_notes" CHECK ("cenit"."assets"."notes" IS NULL OR (length("cenit"."assets"."notes") BETWEEN 1 AND 1000 AND "cenit"."assets"."notes" ~ '[^[:space:]]')),
	CONSTRAINT "asset_inventory_number" CHECK ("cenit"."assets"."inventory_number" IS NULL OR (length("cenit"."assets"."inventory_number") BETWEEN 1 AND 60 AND "cenit"."assets"."inventory_number" ~ '[^[:space:]]')),
	CONSTRAINT "asset_serial_number" CHECK ("cenit"."assets"."serial_number" IS NULL OR (length("cenit"."assets"."serial_number") BETWEEN 1 AND 120 AND "cenit"."assets"."serial_number" ~ '[^[:space:]]')),
	CONSTRAINT "asset_area" CHECK ("cenit"."assets"."area" IS NULL OR (length("cenit"."assets"."area") BETWEEN 1 AND 60 AND "cenit"."assets"."area" ~ '[^[:space:]]')),
	CONSTRAINT "asset_text_0" CHECK ("cenit"."assets"."brand" IS NULL OR (length("cenit"."assets"."brand") BETWEEN 1 AND 255 AND "cenit"."assets"."brand" ~ '[^[:space:]]')),
	CONSTRAINT "asset_text_1" CHECK ("cenit"."assets"."model" IS NULL OR (length("cenit"."assets"."model") BETWEEN 1 AND 255 AND "cenit"."assets"."model" ~ '[^[:space:]]')),
	CONSTRAINT "asset_text_2" CHECK ("cenit"."assets"."furniture_type" IS NULL OR (length("cenit"."assets"."furniture_type") BETWEEN 1 AND 255 AND "cenit"."assets"."furniture_type" ~ '[^[:space:]]')),
	CONSTRAINT "asset_text_3" CHECK ("cenit"."assets"."material" IS NULL OR (length("cenit"."assets"."material") BETWEEN 1 AND 255 AND "cenit"."assets"."material" ~ '[^[:space:]]')),
	CONSTRAINT "asset_text_4" CHECK ("cenit"."assets"."dimensions" IS NULL OR (length("cenit"."assets"."dimensions") BETWEEN 1 AND 255 AND "cenit"."assets"."dimensions" ~ '[^[:space:]]'))
);
--> statement-breakpoint
ALTER TABLE "cenit"."asset_deliveries" ADD CONSTRAINT "asset_deliveries_receiver_id_asset_people_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "cenit"."asset_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_deliveries" ADD CONSTRAINT "asset_deliveries_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_delivery_items" ADD CONSTRAINT "asset_delivery_items_delivery_id_asset_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "cenit"."asset_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_delivery_items" ADD CONSTRAINT "asset_delivery_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "cenit"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_events" ADD CONSTRAINT "asset_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "cenit"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_events" ADD CONSTRAINT "asset_events_person_id_asset_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "cenit"."asset_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_events" ADD CONSTRAINT "asset_events_delivery_id_asset_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "cenit"."asset_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_events" ADD CONSTRAINT "asset_events_loan_id_asset_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "cenit"."asset_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_events" ADD CONSTRAINT "asset_events_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_loan_items" ADD CONSTRAINT "asset_loan_items_loan_id_asset_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "cenit"."asset_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_loan_items" ADD CONSTRAINT "asset_loan_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "cenit"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_loans" ADD CONSTRAINT "asset_loans_borrower_id_asset_people_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "cenit"."asset_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_loans" ADD CONSTRAINT "asset_loans_returned_by_accounts_id_fk" FOREIGN KEY ("returned_by") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_loans" ADD CONSTRAINT "asset_loans_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."asset_people" ADD CONSTRAINT "asset_people_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."assets" ADD CONSTRAINT "assets_custodian_id_asset_people_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "cenit"."asset_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."assets" ADD CONSTRAINT "assets_purchase_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "cenit"."purchase_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."assets" ADD CONSTRAINT "assets_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_delivery_item_asset" ON "cenit"."asset_delivery_items" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_event_asset" ON "cenit"."asset_events" USING btree ("asset_id","occurred_on");--> statement-breakpoint
CREATE INDEX "asset_loan_item_asset" ON "cenit"."asset_loan_items" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_custodian" ON "cenit"."assets" USING btree ("custodian_id");