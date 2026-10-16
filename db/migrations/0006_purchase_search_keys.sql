CREATE FUNCTION cenit.normalize_purchase_search(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT lower(regexp_replace(normalize(value, NFD), U&'[\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]', '', 'g')) $$;
--> statement-breakpoint
ALTER TABLE "cenit"."purchase_request_lines" ADD COLUMN "provider_search" text GENERATED ALWAYS AS (cenit.normalize_purchase_search(provider)) STORED;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "request_number_search" text GENERATED ALWAYS AS (cenit.normalize_purchase_search(request_number)) STORED;--> statement-breakpoint
ALTER TABLE "cenit"."purchase_requests" ADD COLUMN "description_search" text GENERATED ALWAYS AS (cenit.normalize_purchase_search(description)) STORED;
