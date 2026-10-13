CREATE TABLE "cenit"."academic_courses" (
	"version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"official_code" text,
	"name" text NOT NULL,
	"semester" integer NOT NULL,
	"semester_end" integer NOT NULL,
	"credits" numeric(6, 2),
	"display_order" integer NOT NULL,
	"prerequisites" jsonb NOT NULL,
	CONSTRAINT "academic_courses_version_id_code_pk" PRIMARY KEY("version_id","code"),
	CONSTRAINT "academic_course_order" UNIQUE("version_id","display_order"),
	CONSTRAINT "course_code" CHECK (length("cenit"."academic_courses"."code") BETWEEN 1 AND 50 AND "cenit"."academic_courses"."code" = btrim("cenit"."academic_courses"."code")),
	CONSTRAINT "official_course_code" CHECK ("cenit"."academic_courses"."official_code" IS NULL OR (length("cenit"."academic_courses"."official_code") BETWEEN 1 AND 50 AND "cenit"."academic_courses"."official_code" = btrim("cenit"."academic_courses"."official_code"))),
	CONSTRAINT "course_name" CHECK (length("cenit"."academic_courses"."name") BETWEEN 1 AND 200),
	CONSTRAINT "course_semesters" CHECK ("cenit"."academic_courses"."semester" BETWEEN 1 AND 20 AND "cenit"."academic_courses"."semester_end" BETWEEN "cenit"."academic_courses"."semester" AND 20),
	CONSTRAINT "course_credits" CHECK ("cenit"."academic_courses"."credits" IS NULL OR ("cenit"."academic_courses"."credits" > 0 AND "cenit"."academic_courses"."credits" <= 9999.99)),
	CONSTRAINT "course_order" CHECK ("cenit"."academic_courses"."display_order" > 0),
	CONSTRAINT "course_rule" CHECK (jsonb_typeof("cenit"."academic_courses"."prerequisites") = 'object' AND "cenit"."academic_courses"."prerequisites" ? 'kind' AND "cenit"."academic_courses"."prerequisites"->>'kind' IN ('none','course','allOf','anyOf','unsupported','pending'))
);
--> statement-breakpoint
CREATE TABLE "cenit"."academic_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "plan_slug" CHECK ("cenit"."academic_plans"."id" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "plan_name" CHECK (length("cenit"."academic_plans"."name") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "cenit"."academic_prerequisite_edges" (
	"version_id" uuid NOT NULL,
	"from_code" text NOT NULL,
	"to_code" text NOT NULL,
	"source_id" text NOT NULL,
	"interpretation" text NOT NULL,
	"note" text NOT NULL,
	CONSTRAINT "academic_prerequisite_edges_version_id_from_code_to_code_pk" PRIMARY KEY("version_id","from_code","to_code"),
	CONSTRAINT "edge_not_self" CHECK ("cenit"."academic_prerequisite_edges"."from_code" <> "cenit"."academic_prerequisite_edges"."to_code"),
	CONSTRAINT "edge_interpretation" CHECK ("cenit"."academic_prerequisite_edges"."interpretation" IN ('pending','confirmed')),
	CONSTRAINT "edge_note" CHECK (length("cenit"."academic_prerequisite_edges"."note") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "cenit"."academic_sources" (
	"version_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"reference" text,
	"sha256" text NOT NULL,
	"reviewed_at" date,
	"validation_status" text NOT NULL,
	"is_primary" boolean NOT NULL,
	CONSTRAINT "academic_sources_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "source_id" CHECK ("cenit"."academic_sources"."id" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "source_title" CHECK (length("cenit"."academic_sources"."title") BETWEEN 1 AND 200),
	CONSTRAINT "source_reference" CHECK ("cenit"."academic_sources"."reference" IS NULL OR length("cenit"."academic_sources"."reference") BETWEEN 1 AND 500),
	CONSTRAINT "source_hash" CHECK ("cenit"."academic_sources"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "source_validation" CHECK ("cenit"."academic_sources"."validation_status" IN ('example','teamReviewed','clientValidated')),
	CONSTRAINT "source_review_date" CHECK ("cenit"."academic_sources"."validation_status" = 'example' OR "cenit"."academic_sources"."reviewed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "cenit"."academic_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_example" boolean NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "academic_plan_version" UNIQUE("plan_id","version"),
	CONSTRAINT "version_hash" CHECK ("cenit"."academic_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "version_slug" CHECK ("cenit"."academic_versions"."version" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "version_status" CHECK ("cenit"."academic_versions"."status" IN ('draft','published'))
);
--> statement-breakpoint
ALTER TABLE "cenit"."academic_courses" ADD CONSTRAINT "academic_courses_version_id_academic_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "cenit"."academic_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_prerequisite_edges" ADD CONSTRAINT "academic_prerequisite_edges_version_id_from_code_academic_courses_version_id_code_fk" FOREIGN KEY ("version_id","from_code") REFERENCES "cenit"."academic_courses"("version_id","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_prerequisite_edges" ADD CONSTRAINT "academic_prerequisite_edges_version_id_to_code_academic_courses_version_id_code_fk" FOREIGN KEY ("version_id","to_code") REFERENCES "cenit"."academic_courses"("version_id","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_prerequisite_edges" ADD CONSTRAINT "academic_prerequisite_edges_version_id_source_id_academic_sources_version_id_id_fk" FOREIGN KEY ("version_id","source_id") REFERENCES "cenit"."academic_sources"("version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_sources" ADD CONSTRAINT "academic_sources_version_id_academic_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "cenit"."academic_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_versions" ADD CONSTRAINT "academic_versions_plan_id_academic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "cenit"."academic_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_primary_source" ON "cenit"."academic_sources" USING btree ("version_id") WHERE "cenit"."academic_sources"."is_primary";
