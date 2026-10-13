import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ExtractionReviewDraftSchema, headerFields, validateReviewDraft, validCalendarDate, type ContractProblem } from './extraction.js';

const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const uuid = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' });
const stamp = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' });
export const PurchasePayloadSchema = object({
  ...ExtractionReviewDraftSchema.properties,
  header: object({ ...ExtractionReviewDraftSchema.properties.header.properties,
    requestNumber: headerFields.requestNumber, sentDate: headerFields.sentDate,
    description: headerFields.description, totalAmount: headerFields.totalAmount }),
});
export const PurchaseExampleIdSchema = Type.Union([Type.Literal('recovered'), Type.Literal('partial'), Type.Literal('ambiguous')]);
export const PurchaseOriginSchema = Type.Union([object({ type: Type.Literal('manual') }), object({ type: Type.Literal('contract_example'), exampleId: PurchaseExampleIdSchema })]);
export type PurchaseOrigin = Static<typeof PurchaseOriginSchema>;
export const CreatePurchaseSchema = object({ operationId: uuid, origin: Type.Optional(PurchaseOriginSchema), ...PurchasePayloadSchema.properties });
export type PurchasePayload = Static<typeof PurchasePayloadSchema>;
export type CreatePurchase = Static<typeof CreatePurchaseSchema>;
export const PurchaseParamsSchema = object({ id: uuid });
export const PurchaseValidationSchema = object({ expectedVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }) });
export const PurchaseFiltersSchema = object({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' })),
  dateFrom: Type.Optional(headerFields.sentDate), dateTo: Type.Optional(headerFields.sentDate),
  unitCode: Type.Optional(Type.String({ minLength: 1, maxLength: 255, pattern: '\\S' })),
  projectCode: Type.Optional(Type.String({ minLength: 1, maxLength: 255, pattern: '\\S' })),
});
export type PurchaseFilters = Static<typeof PurchaseFiltersSchema>;
export const PurchaseListQuerySchema = object({ ...PurchaseFiltersSchema.properties, reviewStatus: Type.Union([Type.Literal('pending'), Type.Literal('reviewed')]),
  page: Type.Integer({ minimum: 1, maximum: 1000000 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }) });
export type PurchaseListQuery = Static<typeof PurchaseListQuerySchema>;
const actor = object({ id: uuid, name: Type.String({ minLength: 1, maxLength: 200 }) });
export const PurchaseRecordSchema = object({ ...PurchasePayloadSchema.properties, id: uuid, source: Type.Union([Type.Literal('manual'), Type.Literal('contract_example')]), exampleId: Type.Union([PurchaseExampleIdSchema, Type.Null()]),
  reviewStatus: Type.Union([Type.Literal('pending'), Type.Literal('reviewed')]), version: Type.Integer({ minimum: 1 }),
  createdAt: stamp, createdBy: actor, reviewedAt: Type.Union([stamp, Type.Null()]), reviewedBy: Type.Union([actor, Type.Null()]) });
export type PurchaseRecord = Static<typeof PurchaseRecordSchema>;
export const PurchaseResponseSchema = object({ data: PurchaseRecordSchema });
export const PurchaseListResponseSchema = object({ data: Type.Array(object({
  id: uuid, requestNumber: headerFields.requestNumber, sentDate: headerFields.sentDate, description: headerFields.description,
  documentType: ExtractionReviewDraftSchema.properties.administrative.properties.documentType,
  reviewStatus: PurchaseRecordSchema.properties.reviewStatus, version: PurchaseRecordSchema.properties.version,
  source: PurchaseRecordSchema.properties.source, exampleId: PurchaseRecordSchema.properties.exampleId,
})), pagination: object({ page: Type.Integer({ minimum: 1 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }), total: Type.Integer({ minimum: 0 }) }),
  totals: object({ currency: Type.Literal('CLP'), documentTotal: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }) }) });
export type PurchaseListResponse = Static<typeof PurchaseListResponseSchema>;
export function validatePurchaseListQuery(input: unknown): ContractProblem[] {
  if (!Value.Check(PurchaseListQuerySchema, input)) return [...Value.Errors(PurchaseListQuerySchema, input)].map(error => ({ path: error.path, message: 'Revisa el formato o límite del filtro.' }));
  const problems: ContractProblem[] = [];
  for (const key of ['dateFrom', 'dateTo'] as const) {
    const date = input[key];
    if (date && (date.startsWith('0000-') || !validCalendarDate(date))) problems.push({ path: `/${key}`, message: 'Ingresa una fecha válida entre los años 0001 y 9999.' });
  }
  if (!problems.length && input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) problems.push({ path: '/dateTo', message: 'La fecha final debe ser igual o posterior a la inicial.' });
  return problems;
}
export function validateCreatePurchase(input: unknown): ContractProblem[] {
  if (!Value.Check(CreatePurchaseSchema, input)) return [...Value.Errors(CreatePurchaseSchema, input)].map(error => ({ path: error.path, message: 'Revisa el formato o completa los campos obligatorios.' }));
  const problems = validateReviewDraft({ header: input.header, lines: input.lines, administrative: input.administrative });
  // PostgreSQL date has no year zero; reject it before reaching persistence.
  if (input.header.sentDate.startsWith('0000-')) problems.push({ path: '/header/sentDate', message: 'El año debe ser mayor que cero.' });
  return problems;
}
