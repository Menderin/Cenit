CREATE TABLE "cenit"."academic_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"course_code" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"grade" numeric,
	CONSTRAINT "attempt_number_unique" UNIQUE("enrollment_id","course_code","attempt_number"),
	CONSTRAINT "attempt_positive" CHECK ("cenit"."academic_attempts"."attempt_number" > 0),
	CONSTRAINT "attempt_grade_precision" CHECK ("cenit"."academic_attempts"."grade" IS NULL OR "cenit"."academic_attempts"."grade" = trunc("cenit"."academic_attempts"."grade", 1)),
	CONSTRAINT "attempt_grade" CHECK (("cenit"."academic_attempts"."status" = 'inProgress' AND "cenit"."academic_attempts"."grade" IS NULL) OR ("cenit"."academic_attempts"."status" = 'passed' AND "cenit"."academic_attempts"."grade" IS NOT NULL AND "cenit"."academic_attempts"."grade" BETWEEN 4 AND 7) OR ("cenit"."academic_attempts"."status" = 'failed' AND "cenit"."academic_attempts"."grade" IS NOT NULL AND "cenit"."academic_attempts"."grade" >= 1 AND "cenit"."academic_attempts"."grade" < 4))
);
--> statement-breakpoint
CREATE TABLE "cenit"."academic_enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	CONSTRAINT "one_demo_plan_per_student" UNIQUE("student_id"),
	CONSTRAINT "enrollment_version" UNIQUE("id","version_id")
);
--> statement-breakpoint
CREATE TABLE "cenit"."academic_students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rut" text NOT NULL,
	"rut_search" text NOT NULL,
	CONSTRAINT "student_account" UNIQUE("account_id"),
	CONSTRAINT "student_rut_search" UNIQUE("rut_search"),
	CONSTRAINT "student_name" CHECK (length("cenit"."academic_students"."name") BETWEEN 1 AND 200),
	CONSTRAINT "student_rut" CHECK (length("cenit"."academic_students"."rut") BETWEEN 1 AND 30),
	CONSTRAINT "student_rut_search_value" CHECK ("cenit"."academic_students"."rut_search" = upper(replace("cenit"."academic_students"."rut", '.', '')))
);
--> statement-breakpoint
ALTER TABLE "cenit"."academic_attempts" ADD CONSTRAINT "academic_attempts_enrollment_id_version_id_academic_enrollments_id_version_id_fk" FOREIGN KEY ("enrollment_id","version_id") REFERENCES "cenit"."academic_enrollments"("id","version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_attempts" ADD CONSTRAINT "academic_attempts_version_id_course_code_academic_courses_version_id_code_fk" FOREIGN KEY ("version_id","course_code") REFERENCES "cenit"."academic_courses"("version_id","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_enrollments" ADD CONSTRAINT "academic_enrollments_student_id_academic_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "cenit"."academic_students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_enrollments" ADD CONSTRAINT "academic_enrollments_version_id_academic_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "cenit"."academic_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenit"."academic_students" ADD CONSTRAINT "academic_students_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "cenit"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_attempt" ON "cenit"."academic_attempts" USING btree ("enrollment_id","course_code") WHERE "cenit"."academic_attempts"."status" = 'inProgress';