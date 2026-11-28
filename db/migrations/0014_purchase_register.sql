-- Cada compra pasa a ser una fila del «Registro de gastos»: proveedor y códigos son de la compra, la Fecha es el día de registro
-- y la segunda revisión en Cenit se retira (todas las compras llegan ya aprobadas).
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "record_date" date;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "unit_code" text;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "project_code" text;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "accounting_code" text;--> statement-breakpoint
UPDATE "cenit"."purchase_requests" SET "record_date" = "sent_date";--> statement-breakpoint
-- Proveedor y códigos se copian de las líneas sólo cuando todas coinciden; si difieren quedan vacíos para revisarlos.
UPDATE "cenit"."purchase_requests" p SET
  "provider" = CASE WHEN s.providers = 1 THEN s.provider END,
  "unit_code" = CASE WHEN s.units = 1 THEN s.unit_code END,
  "project_code" = CASE WHEN s.projects = 1 THEN s.project_code END,
  "accounting_code" = CASE WHEN s.accounts = 1 THEN s.accounting_code END
FROM (SELECT request_id,
    count(DISTINCT provider) AS providers, min(provider) AS provider, count(DISTINCT unit_code) AS units, min(unit_code) AS unit_code,
    count(DISTINCT project_code) AS projects, min(project_code) AS project_code, count(DISTINCT accounting_code) AS accounts, min(accounting_code) AS accounting_code
  FROM "cenit"."purchase_request_lines" GROUP BY request_id) s
WHERE s.request_id = p.id;--> statement-breakpoint
UPDATE "cenit"."purchase_requests" SET "document" = 'SISTEMA DE COMPRAS' WHERE "document" IS NULL;--> statement-breakpoint
UPDATE "cenit"."purchase_requests" SET "payment_situation" = 'PENDIENTE' WHERE "payment_situation" IS NULL;--> statement-breakpoint
-- El RUT pasa a guardarse sin puntos ni ceros a la izquierda (12345678-5). El que no se deja normalizar queda igual y se corrige al editar.
UPDATE "cenit"."purchase_requests" p SET "rut" = n.normalized
FROM (SELECT id, ltrim(left(c.compact, -1), '0') || '-' || right(c.compact, 1) AS normalized
  FROM (SELECT id, upper(regexp_replace("rut", '[^0-9kK]', '', 'g')) AS compact FROM "cenit"."purchase_requests" WHERE "rut" IS NOT NULL) c) n
WHERE n.id = p.id AND n.normalized ~ '^[1-9][0-9]{0,8}-[0-9K]$';--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ALTER COLUMN "record_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ALTER COLUMN "sent_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ALTER COLUMN "document" SET DEFAULT 'SISTEMA DE COMPRAS';--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ALTER COLUMN "document" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ALTER COLUMN "payment_situation" SET DEFAULT 'PENDIENTE';--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ALTER COLUMN "payment_situation" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" RENAME COLUMN "unit_name" TO "area";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" DROP CONSTRAINT "purchase_review";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" DROP CONSTRAINT "purchase_requests_reviewed_by_accounts_id_fk";--> statement-breakpoint
DROP INDEX "cenit"."purchase_list";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" DROP COLUMN "review_status";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" DROP COLUMN "reviewed_by";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" DROP COLUMN "reviewed_at";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "provider_search" text GENERATED ALWAYS AS (cenit.normalize_purchase_search(provider)) STORED;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "rut_search" text GENERATED ALWAYS AS (replace(rut, '-', '')) STORED;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" DROP CONSTRAINT "purchase_date";--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD CONSTRAINT "purchase_date" CHECK ("cenit"."purchase_requests"."record_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND ("cenit"."purchase_requests"."sent_date" IS NULL OR "cenit"."purchase_requests"."sent_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'));--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD CONSTRAINT "purchase_text_12" CHECK ("cenit"."purchase_requests"."provider" IS NULL OR (length("cenit"."purchase_requests"."provider") BETWEEN 1 AND 255 AND "cenit"."purchase_requests"."provider" ~ '[^[:space:]]'));--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD CONSTRAINT "purchase_text_13" CHECK ("cenit"."purchase_requests"."unit_code" IS NULL OR (length("cenit"."purchase_requests"."unit_code") BETWEEN 1 AND 255 AND "cenit"."purchase_requests"."unit_code" ~ '[^[:space:]]'));--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD CONSTRAINT "purchase_text_14" CHECK ("cenit"."purchase_requests"."project_code" IS NULL OR (length("cenit"."purchase_requests"."project_code") BETWEEN 1 AND 255 AND "cenit"."purchase_requests"."project_code" ~ '[^[:space:]]'));--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD CONSTRAINT "purchase_text_15" CHECK ("cenit"."purchase_requests"."accounting_code" IS NULL OR (length("cenit"."purchase_requests"."accounting_code") BETWEEN 1 AND 255 AND "cenit"."purchase_requests"."accounting_code" ~ '[^[:space:]]'));--> statement-breakpoint
CREATE INDEX "purchase_record_list" ON "cenit"."purchase_requests" USING btree ("record_date","id");--> statement-breakpoint
CREATE INDEX "purchase_codes" ON "cenit"."purchase_requests" USING btree ("unit_code","project_code");
