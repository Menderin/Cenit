import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { CaptureOriginSchema, CaptureMetadataSchema, ExtractionReviewDraftSchema, headerFields, validateReviewDraft, validCalendarDate, type ContractProblem } from './extraction.js';

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
export const PurchaseOriginSchema = Type.Union([object({ type: Type.Literal('manual') }), object({ type: Type.Literal('contract_example'), exampleId: PurchaseExampleIdSchema }), CaptureOriginSchema]);
export type PurchaseOrigin = Static<typeof PurchaseOriginSchema>;
export const CreatePurchaseSchema = object({ operationId: uuid, origin: Type.Optional(PurchaseOriginSchema), ...PurchasePayloadSchema.properties });
export type PurchasePayload = Static<typeof PurchasePayloadSchema>;
export type CreatePurchase = Static<typeof CreatePurchaseSchema>;
export const PurchaseParamsSchema = object({ id: uuid });
export const PurchaseValidationSchema = object({ expectedVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }) });
export const UpdatePurchaseSchema = object({ expectedVersion: PurchaseValidationSchema.properties.expectedVersion, ...PurchasePayloadSchema.properties });
export type UpdatePurchase = Static<typeof UpdatePurchaseSchema>;
export const PurchaseDeletionSchema = PurchaseValidationSchema;
export const PurchaseDeletionResponseSchema = object({ data: object({ id: uuid }) });
export const PurchaseSummaryResponseSchema = object({ data: object({
  requests: Type.Integer({ minimum: 0 }), pending: Type.Integer({ minimum: 0 }),
  currency: Type.Literal('CLP'), pendingAmount: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }),
  days: Type.Array(object({ date: headerFields.sentDate, count: Type.Integer({ minimum: 0 }) })),
  overview: Type.Optional(object({
    documentTotal: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }),
    documentTotalThisMonth: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }),
    registrationMonth: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
    registeredThisYear: Type.Integer({ minimum: 0 }),
    registeredThisMonth: Type.Integer({ minimum: 0 }),
    sourceCounts: object({ manual: Type.Integer({ minimum: 0 }), image_capture: Type.Integer({ minimum: 0 }), contract_example: Type.Integer({ minimum: 0 }) }),
    registrationDays: Type.Array(object({ date: headerFields.sentDate, count: Type.Integer({ minimum: 0 }) }), { maxItems: 30 }),
    // Year view for Inicio: amount by month (sent date) and by document type. Optional so older clients and mocks remain valid.
    documentTotalThisYear: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]*)$' })),
    monthlyTotals: Type.Optional(Type.Array(object({ month: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }), count: Type.Integer({ minimum: 0 }), amount: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }) }), { maxItems: 12 })),
    documentTypes: Type.Optional(Type.Array(object({ documentType: Type.Union([Type.String({ minLength: 1, maxLength: 255 }), Type.Null()]), count: Type.Integer({ minimum: 0 }), amount: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }) }), { maxItems: 6 })),
    recentRecords: Type.Array(object({ id: uuid, requestNumber: headerFields.requestNumber, description: headerFields.description,
      sentDate: headerFields.sentDate, totalAmount: headerFields.totalAmount, createdAt: stamp,
      source: Type.Union([Type.Literal('manual'), Type.Literal('image_capture'), Type.Literal('contract_example')]),
    }), { maxItems: 8 }),
  })),
}) });
export type PurchaseSummaryResponse = Static<typeof PurchaseSummaryResponseSchema>;
export const PurchaseCapabilitiesResponseSchema = object({ data: object({ secondReviewEnabled: Type.Boolean(), sheetsSyncEnabled: Type.Boolean() }) });
export type PurchaseCapabilities = Static<typeof PurchaseCapabilitiesResponseSchema>['data'];
export const PurchaseSheetsQuerySchema = object({ purchaseId: Type.Optional(uuid) });
export const PurchaseSheetsResponseSchema = object({ data: object({
  status: Type.Union([Type.Literal('disabled'), Type.Literal('pending'), Type.Literal('synced'), Type.Literal('error')]),
  pending: Type.Integer({ minimum: 0 }), lastSyncedAt: Type.Union([stamp, Type.Null()]),
  url: Type.Union([Type.String({ pattern: '^https://docs\\.google\\.com/spreadsheets/d/[a-zA-Z0-9_-]+/edit$' }), Type.Null()]),
}) });
export type PurchaseSheetsResponse = Static<typeof PurchaseSheetsResponseSchema>;
export const PurchaseFiltersSchema = object({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' })),
  dateFrom: Type.Optional(headerFields.sentDate), dateTo: Type.Optional(headerFields.sentDate),
  unitCode: Type.Optional(Type.String({ minLength: 1, maxLength: 255, pattern: '\\S' })),
  projectCode: Type.Optional(Type.String({ minLength: 1, maxLength: 255, pattern: '\\S' })),
});
export type PurchaseFilters = Static<typeof PurchaseFiltersSchema>;
export const PurchaseListQuerySchema = object({ ...PurchaseFiltersSchema.properties, reviewStatus: Type.Union([Type.Literal('pending'), Type.Literal('reviewed'), Type.Literal('all')]),
  sort: Type.Optional(Type.Union([Type.Literal('sentDateDesc'), Type.Literal('sentDateAsc')])),
  page: Type.Integer({ minimum: 1, maximum: 1000000 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }) });
export type PurchaseListQuery = Static<typeof PurchaseListQuerySchema>;
const actor = object({ id: uuid, name: Type.String({ minLength: 1, maxLength: 200 }) });
export const PurchaseRecordSchema = object({ ...PurchasePayloadSchema.properties, id: uuid, source: Type.Union([Type.Literal('manual'), Type.Literal('contract_example'), Type.Literal('image_capture')]), exampleId: Type.Union([PurchaseExampleIdSchema, Type.Null()]),
  capture: Type.Optional(Type.Union([CaptureMetadataSchema, Type.Null()])),
  reviewStatus: Type.Union([Type.Literal('pending'), Type.Literal('reviewed')]), version: Type.Integer({ minimum: 1 }),
  createdAt: stamp, createdBy: actor, reviewedAt: Type.Union([stamp, Type.Null()]), reviewedBy: Type.Union([actor, Type.Null()]) });
export type PurchaseRecord = Static<typeof PurchaseRecordSchema>;
export const PurchaseResponseSchema = object({ data: PurchaseRecordSchema });
export const PurchaseListResponseSchema = object({ data: Type.Array(object({
  id: uuid, requestNumber: headerFields.requestNumber, sentDate: headerFields.sentDate, description: headerFields.description,
  totalAmount: headerFields.totalAmount,
  documentType: ExtractionReviewDraftSchema.properties.administrative.properties.documentType,
  reviewStatus: PurchaseRecordSchema.properties.reviewStatus, version: PurchaseRecordSchema.properties.version,
  source: PurchaseRecordSchema.properties.source, exampleId: PurchaseRecordSchema.properties.exampleId,
  capture: PurchaseRecordSchema.properties.capture,
})), pagination: object({ page: Type.Integer({ minimum: 1 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }), total: Type.Integer({ minimum: 0 }) }),
  availableYears: Type.Optional(Type.Array(Type.Integer({ minimum: 1, maximum: 9999 }), { uniqueItems: true })),
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
  if (!Value.Check(CreatePurchaseSchema, input)) return [...Value.Errors(CreatePurchaseSchema, input)].map(error => ({ path: error.path,
    message: error.value === null || error.value === '' || error.value === undefined ? 'Completa este campo obligatorio.'
      : /\/(totalAmount|taxAmount|price|amount)$/.test(error.path) ? 'Escribe sólo números, por ejemplo 1234567 o 1.234.567.'
      : error.path.endsWith('/sentDate') ? 'Escribe una fecha válida en formato dd/mm/aaaa.' : 'Revisa el formato o el límite de este campo.',
  }));
  return validatePurchasePayload({ header: input.header, lines: input.lines, administrative: input.administrative });
}
export function validatePurchasePayload(input: unknown): ContractProblem[] {
  if (!Value.Check(PurchasePayloadSchema, input)) return [...Value.Errors(PurchasePayloadSchema, input)].map(error => ({ path: error.path,
    message: error.value === null || error.value === '' || error.value === undefined ? 'Completa este campo obligatorio.'
      : /\/(totalAmount|taxAmount|price|amount)$/.test(error.path) ? 'Escribe sólo números, por ejemplo 1234567 o 1.234.567.'
      : error.path.endsWith('/sentDate') ? 'Escribe una fecha válida en formato dd/mm/aaaa.' : 'Revisa el formato o el límite de este campo.',
  }));
  const problems = validateReviewDraft(input);
  // PostgreSQL date has no year zero; reject it before reaching persistence.
  if (input.header.sentDate.startsWith('0000-')) problems.push({ path: '/header/sentDate', message: 'El año debe ser mayor que cero.' });
  return problems;
}
