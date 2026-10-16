import { Type, type Static } from '@sinclair/typebox';
export { compactRut, isValidRut, isValidRutSearch, formatRutInput } from './rut.js';

const strict = { additionalProperties: false };
export const SlugSchema = Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' });
export const CourseCodeSchema = Type.String({ minLength: 1, maxLength: 50, pattern: '^\\S(?:.*\\S)?$' });
export const IdSchema = Type.String({ pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' });
const title = Type.String({ minLength: 1, maxLength: 200 });
export const PrerequisiteSchema = Type.Recursive(Self => Type.Union([
  Type.Object({ kind: Type.Literal('none') }, strict),
  Type.Object({ kind: Type.Literal('course'), code: CourseCodeSchema }, strict),
  Type.Object({ kind: Type.Literal('allOf'), rules: Type.Array(Self, { minItems: 2, maxItems: 100 }) }, strict),
  Type.Object({ kind: Type.Literal('anyOf'), rules: Type.Array(Self, { minItems: 2, maxItems: 100 }) }, strict),
  Type.Object({ kind: Type.Literal('unsupported'), description: Type.String({ minLength: 1, maxLength: 500 }) }, strict),
  Type.Object({ kind: Type.Literal('pending'), description: Type.String({ minLength: 1, maxLength: 500 }) }, strict),
]), { $id: 'AcademicPrerequisite' });
export type Prerequisite = Static<typeof PrerequisiteSchema>;
export const SourceSchema = Type.Object({
  sourceId: SlugSchema, title, reference: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
  sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  reviewedAt: Type.Union([Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }), Type.Null()]),
  validationStatus: Type.Union([Type.Literal('example'), Type.Literal('teamReviewed'), Type.Literal('clientValidated')]),
}, strict);
export const CourseSchema = Type.Object({
  code: CourseCodeSchema, codeKind: Type.Literal('internal'), officialCode: Type.Union([CourseCodeSchema, Type.Null()]),
  name: title, semester: Type.Integer({ minimum: 1, maximum: 20 }), semesterEnd: Type.Integer({ minimum: 1, maximum: 20 }),
  credits: Type.Union([Type.Number({ exclusiveMinimum: 0, maximum: 9999.99 }), Type.Null()]),
  displayOrder: Type.Integer({ minimum: 1 }), prerequisites: PrerequisiteSchema,
}, strict);
export const PrerequisiteEdgeSchema = Type.Object({
  fromCode: CourseCodeSchema, toCode: CourseCodeSchema, sourceId: SlugSchema,
  interpretation: Type.Union([Type.Literal('pending'), Type.Literal('confirmed')]),
  note: Type.String({ minLength: 1, maxLength: 500 }),
}, strict);
export const PlanSchema = Type.Object({
  planId: SlugSchema, version: SlugSchema, name: title, isExample: Type.Boolean(),
  source: SourceSchema, sources: Type.Array(SourceSchema, { minItems: 1, maxItems: 20 }),
  courses: Type.Array(CourseSchema, { minItems: 1, maxItems: 500 }),
  prerequisiteEdges: Type.Array(PrerequisiteEdgeSchema, { maxItems: 5000 }),
}, strict);
export type AcademicPlan = Static<typeof PlanSchema>;
export type AcademicCourse = Static<typeof CourseSchema>;
export const PlanResponseSchema = Type.Object({ data: PlanSchema }, strict);
export const PlansResponseSchema = Type.Object({ data: Type.Array(Type.Object({
  planId: SlugSchema, name: title, versions: Type.Array(Type.Object({ version: SlugSchema, isExample: Type.Boolean() }, strict)),
}, strict)) }, strict);
export const PlanParamsSchema = Type.Object({ planId: SlugSchema, version: SlugSchema }, strict);
export const StudentParamsSchema = Type.Object({ studentId: IdSchema }, strict);
export const StudentSearchSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200, pattern: '.*\\S.*' })),
  rut: Type.Optional(Type.String({ minLength: 1, maxLength: 30, pattern: '^[0-9.Kk-]+$', description: 'Prefijo numérico de RUT o RUT completo (módulo 11). Puntos opcionales, K sin distinguir mayúsculas. Los cuerpos de siete cifras con DV numérico requieren guion para distinguirlos de un prefijo de ocho cifras.' })),
  page: Type.Integer({ minimum: 1, maximum: 100000, default: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
}, strict);
export type StudentSearch = Static<typeof StudentSearchSchema>;
export const StudentSchema = Type.Object({ id: IdSchema, name: title, rut: Type.String({ minLength: 1, maxLength: 30 }) }, strict);
export const StudentsResponseSchema = Type.Object({
  data: Type.Array(StudentSchema), page: Type.Integer({ minimum: 1 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }), totalItems: Type.Integer({ minimum: 0 }),
}, strict);
// Canonical Spanish notation: one nonzero decimal with comma, or integer (6.0 -> "6").
export const PassingGradeSchema = Type.String({ pattern: '^(?:[4-6](?:,[1-9])?|7)$' });
export const AttemptSchema = Type.Union([
  Type.Object({ attemptNumber: Type.Integer({ minimum: 1 }), status: Type.Literal('passed'), grade: PassingGradeSchema }, strict),
  Type.Object({ attemptNumber: Type.Integer({ minimum: 1 }), status: Type.Literal('failed'), grade: Type.String({ pattern: '^[1-3](?:,[1-9])?$' }) }, strict),
  Type.Object({ attemptNumber: Type.Integer({ minimum: 1 }), status: Type.Literal('inProgress'), grade: Type.Null() }, strict),
]);
export type Attempt = Static<typeof AttemptSchema>;
export const CourseProgressSchema = Type.Object({
  code: CourseCodeSchema,
  status: Type.Union([Type.Literal('passed'), Type.Literal('failed'), Type.Literal('inProgress'), Type.Literal('notTaken')]),
  attemptCount: Type.Integer({ minimum: 0 }), passingGrade: Type.Union([PassingGradeSchema, Type.Null()]),
  attempts: Type.Array(AttemptSchema),
}, strict);
export const ProgressResponseSchema = Type.Object({ data: Type.Object({
  student: StudentSchema, plan: Type.Object({ planId: SlugSchema, version: SlugSchema }, strict),
  courses: Type.Array(CourseProgressSchema, { maxItems: 500 }), origin: Type.Literal('demo'),
}, strict) }, strict);
export type ProgressResponse = Static<typeof ProgressResponseSchema>;
export type PlansResponse = Static<typeof PlansResponseSchema>;
export type StudentsResponse = Static<typeof StudentsResponseSchema>;
