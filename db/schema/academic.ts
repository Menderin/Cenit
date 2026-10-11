import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, integer, jsonb, numeric, pgSchema, primaryKey, text, unique, uniqueIndex, uuid, date } from 'drizzle-orm/pg-core';
import type { Prerequisite } from '../../packages/contracts/src/academic/index.js';

export const cenit = pgSchema('cenit');
export const academicPlans = cenit.table('academic_plans', {
  id: text('id').primaryKey(), name: text('name').notNull(),
}, t => [check('plan_slug', sql`${t.id} ~ '^[A-Za-z0-9_-]{1,64}$'`), check('plan_name', sql`length(${t.name}) BETWEEN 1 AND 200`)]);
export const academicVersions = cenit.table('academic_versions', {
  id: uuid('id').primaryKey(), planId: text('plan_id').notNull().references(() => academicPlans.id),
  version: text('version').notNull(), status: text('status').notNull().default('draft'), isExample: boolean('is_example').notNull(), contentHash: text('content_hash').notNull(),
}, t => [unique('academic_plan_version').on(t.planId, t.version),
  check('version_hash', sql`${t.contentHash} ~ '^[0-9a-f]{64}$'`), check('version_slug', sql`${t.version} ~ '^[A-Za-z0-9_-]{1,64}$'`), check('version_status', sql`${t.status} IN ('draft','published')`)]);
export const academicSources = cenit.table('academic_sources', {
  versionId: uuid('version_id').notNull().references(() => academicVersions.id), id: text('id').notNull(),
  title: text('title').notNull(), reference: text('reference'), sha256: text('sha256').notNull(),
  reviewedAt: date('reviewed_at'), validationStatus: text('validation_status').notNull(), isPrimary: boolean('is_primary').notNull(),
}, t => [primaryKey({ columns: [t.versionId, t.id] }),
  uniqueIndex('academic_primary_source').on(t.versionId).where(sql`${t.isPrimary}`),
  check('source_id', sql`${t.id} ~ '^[A-Za-z0-9_-]{1,64}$'`),
  check('source_title', sql`length(${t.title}) BETWEEN 1 AND 200`),
  check('source_reference', sql`${t.reference} IS NULL OR length(${t.reference}) BETWEEN 1 AND 500`),
  check('source_hash', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  check('source_validation', sql`${t.validationStatus} IN ('example','teamReviewed','clientValidated')`),
  check('source_review_date', sql`${t.validationStatus} = 'example' OR ${t.reviewedAt} IS NOT NULL`)]);
export const academicCourses = cenit.table('academic_courses', {
  versionId: uuid('version_id').notNull().references(() => academicVersions.id), code: text('code').notNull(),
  officialCode: text('official_code'), name: text('name').notNull(), semester: integer('semester').notNull(),
  semesterEnd: integer('semester_end').notNull(), credits: numeric('credits', { precision: 6, scale: 2 }),
  displayOrder: integer('display_order').notNull(), prerequisites: jsonb('prerequisites').$type<Prerequisite>().notNull(),
}, t => [primaryKey({ columns: [t.versionId, t.code] }),
  unique('academic_course_order').on(t.versionId, t.displayOrder),
  check('course_code', sql`length(${t.code}) BETWEEN 1 AND 50 AND ${t.code} = btrim(${t.code})`),
  check('official_course_code', sql`${t.officialCode} IS NULL OR (length(${t.officialCode}) BETWEEN 1 AND 50 AND ${t.officialCode} = btrim(${t.officialCode}))`),
  check('course_name', sql`length(${t.name}) BETWEEN 1 AND 200`),
  check('course_semesters', sql`${t.semester} BETWEEN 1 AND 20 AND ${t.semesterEnd} BETWEEN ${t.semester} AND 20`),
  check('course_credits', sql`${t.credits} IS NULL OR (${t.credits} > 0 AND ${t.credits} <= 9999.99)`),
  check('course_order', sql`${t.displayOrder} > 0`),
  check('course_rule', sql`jsonb_typeof(${t.prerequisites}) = 'object' AND ${t.prerequisites} ? 'kind' AND ${t.prerequisites}->>'kind' IN ('none','course','allOf','anyOf','unsupported','pending')`)]);
export const academicPrerequisiteEdges = cenit.table('academic_prerequisite_edges', {
  versionId: uuid('version_id').notNull(), fromCode: text('from_code').notNull(), toCode: text('to_code').notNull(),
  sourceId: text('source_id').notNull(), interpretation: text('interpretation').notNull(), note: text('note').notNull(),
}, t => [primaryKey({ columns: [t.versionId, t.fromCode, t.toCode] }),
  foreignKey({ columns: [t.versionId, t.fromCode], foreignColumns: [academicCourses.versionId, academicCourses.code] }),
  foreignKey({ columns: [t.versionId, t.toCode], foreignColumns: [academicCourses.versionId, academicCourses.code] }),
  foreignKey({ columns: [t.versionId, t.sourceId], foreignColumns: [academicSources.versionId, academicSources.id] }),
  check('edge_not_self', sql`${t.fromCode} <> ${t.toCode}`),
  check('edge_interpretation', sql`${t.interpretation} IN ('pending','confirmed')`),
  check('edge_note', sql`length(${t.note}) BETWEEN 1 AND 500`)]);
