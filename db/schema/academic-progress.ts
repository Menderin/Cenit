import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, numeric, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academicCourses, academicVersions, cenit } from './academic.js';
import { accounts } from './auth.js';

export const academicStudents = cenit.table('academic_students', {
    id: uuid('id').primaryKey(), accountId: uuid('account_id').notNull().references(() => accounts.id),
    name: text('name').notNull(), rut: text('rut').notNull(), rutSearch: text('rut_search').notNull(),
  }, t => [unique('student_account').on(t.accountId), unique('student_rut_search').on(t.rutSearch),
    check('student_name', sql`length(${t.name}) BETWEEN 1 AND 200`),
    check('student_rut', sql`length(${t.rut}) BETWEEN 1 AND 30`),
    check('student_rut_search_value', sql`${t.rutSearch} = upper(replace(${t.rut}, '.', ''))`)]);
export const academicEnrollments = cenit.table('academic_enrollments', {
    id: uuid('id').primaryKey(), studentId: uuid('student_id').notNull().references(() => academicStudents.id),
    versionId: uuid('version_id').notNull().references(() => academicVersions.id),
  }, t => [unique('one_demo_plan_per_student').on(t.studentId), unique('enrollment_version').on(t.id, t.versionId)]);
export const academicAttempts = cenit.table('academic_attempts', {
    id: uuid('id').primaryKey(), enrollmentId: uuid('enrollment_id').notNull(), versionId: uuid('version_id').notNull(),
    courseCode: text('course_code').notNull(), attemptNumber: integer('attempt_number').notNull(),
    status: text('status').notNull(), grade: numeric('grade'),
  }, t => [
    foreignKey({ columns: [t.enrollmentId, t.versionId], foreignColumns: [academicEnrollments.id, academicEnrollments.versionId] }),
    foreignKey({ columns: [t.versionId, t.courseCode], foreignColumns: [academicCourses.versionId, academicCourses.code] }),
    unique('attempt_number_unique').on(t.enrollmentId, t.courseCode, t.attemptNumber),
    uniqueIndex('one_current_attempt').on(t.enrollmentId, t.courseCode).where(sql`${t.status} = 'inProgress'`),
    check('attempt_positive', sql`${t.attemptNumber} > 0`),
    check('attempt_grade_precision', sql`${t.grade} IS NULL OR ${t.grade} = trunc(${t.grade}, 1)`),
    check('attempt_grade', sql`(${t.status} = 'inProgress' AND ${t.grade} IS NULL) OR (${t.status} = 'passed' AND ${t.grade} IS NOT NULL AND ${t.grade} BETWEEN 4 AND 7) OR (${t.status} = 'failed' AND ${t.grade} IS NOT NULL AND ${t.grade} >= 1 AND ${t.grade} < 4)`),
  ]);
