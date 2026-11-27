import { Type, type Static, type TSchema, type TProperties } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { CaptureOriginSchema, CaptureMetadataSchema, EXTRACTION_LIMITS, headerFields, lineFields, validCalendarDate, type ContractProblem } from './extraction.js';
import { PurchaseBreakdownSchema, PurchaseCodeSchema, PurchaseYearSchema } from './insights.js';

const object = <T extends TProperties>(fields: T) => Type.Object(fields, { additionalProperties: false });
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const uuid = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' });
const stamp = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' });
const text = Type.String({ minLength: 1, maxLength: EXTRACTION_LIMITS.textLength, pattern: '\\S' });
const amount = headerFields.totalAmount, date = headerFields.sentDate;
// RUT normalizado sin puntos: cuerpo y dígito verificador. Un verificador que no cuadra se avisa en pantalla, no se rechaza.
export const RutSchema = Type.String({ pattern: '^[1-9][0-9]{0,8}-[0-9K]$' });

/** La fila del «Registro de gastos», en el orden de la planilla del cliente. */
export const recordFields = {
  recordDate: date, document: text, requestNumber: headerFields.requestNumber, provider: text, description: headerFields.description,
  totalAmount: amount, documentType: text, bi: text, unitCode: text, projectCode: text, accountingCode: text, rut: RutSchema,
  area: text, item: text, paymentSituation: text,
};
export const requiredRecordFields = ['recordDate', 'document', 'requestNumber', 'description', 'totalAmount', 'paymentSituation'] as const;
/** Lo que Oracle muestra y la planilla no usa. */
export const oracleFields = {
  sentDate: date, sentTime: headerFields.sentTime, oracleId: text, sender: text, recipient: text, taxAmount: amount, attachmentReference: text,
};
const required = new Set<string>(requiredRecordFields);
const RecordSchema = object(Object.fromEntries(Object.entries(recordFields).map(([key, schema]) => [key, required.has(key) ? schema : nullable(schema)])) as {
  [K in keyof typeof recordFields]: K extends typeof requiredRecordFields[number] ? typeof recordFields[K] : ReturnType<typeof nullable<typeof recordFields[K]>> });
const OracleSchema = object(Object.fromEntries(Object.entries(oracleFields).map(([key, schema]) => [key, nullable(schema)])) as {
  [K in keyof typeof oracleFields]: ReturnType<typeof nullable<typeof oracleFields[K]>> });
const LineSchema = object(Object.fromEntries(Object.entries(lineFields).map(([key, schema]) => [key, nullable(schema)])) as {
  [K in keyof typeof lineFields]: ReturnType<typeof nullable<typeof lineFields[K]>> });

export const PurchasePayloadSchema = object({ record: RecordSchema, oracle: OracleSchema, lines: Type.Array(LineSchema, { maxItems: EXTRACTION_LIMITS.maxLines }) });
export type PurchasePayload = Static<typeof PurchasePayloadSchema>;
export type PurchaseRecordFields = PurchasePayload['record'];
export type PurchaseOracleFields = PurchasePayload['oracle'];
export type PurchaseLine = PurchasePayload['lines'][number];
export const PurchaseExampleIdSchema = Type.Union([Type.Literal('recovered'), Type.Literal('partial'), Type.Literal('ambiguous')]);
export const PurchaseOriginSchema = Type.Union([object({ type: Type.Literal('manual') }), object({ type: Type.Literal('contract_example'), exampleId: PurchaseExampleIdSchema }), CaptureOriginSchema]);
export type PurchaseOrigin = Static<typeof PurchaseOriginSchema>;
export const CreatePurchaseSchema = object({ operationId: uuid, origin: Type.Optional(PurchaseOriginSchema), ...PurchasePayloadSchema.properties });
export type CreatePurchase = Static<typeof CreatePurchaseSchema>;
export const PurchaseParamsSchema = object({ id: uuid });
const expectedVersion = Type.Integer({ minimum: 1, maximum: 2147483647 });
export const UpdatePurchaseSchema = object({ expectedVersion, ...PurchasePayloadSchema.properties });
export type UpdatePurchase = Static<typeof UpdatePurchaseSchema>;
export const PurchaseDeletionSchema = object({ expectedVersion });
export const PurchaseDeletionResponseSchema = object({ data: object({ id: uuid }) });
export const PurchasePaymentSchema = object({ expectedVersion, paymentSituation: text });
export type PurchasePayment = Static<typeof PurchasePaymentSchema>;

// Inicio: `pending`, `pendingAmount` y `days` cuentan las compras que aún no están PAGADO («por pagar»), incluido un valor anotado antes como «En revisión».
export const PurchaseSummaryResponseSchema = object({ data: object({
  requests: Type.Integer({ minimum: 0 }), pending: Type.Integer({ minimum: 0 }),
  currency: Type.Literal('CLP'), pendingAmount: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }),
  days: Type.Array(object({ date, count: Type.Integer({ minimum: 0 }) })),
  overview: Type.Optional(object({
    documentTotal: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }),
    documentTotalThisMonth: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }),
    registrationMonth: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
    registeredThisYear: Type.Integer({ minimum: 0 }),
    registeredThisMonth: Type.Integer({ minimum: 0 }),
    sourceCounts: object({ manual: Type.Integer({ minimum: 0 }), image_capture: Type.Integer({ minimum: 0 }), contract_example: Type.Integer({ minimum: 0 }) }),
    registrationDays: Type.Array(object({ date, count: Type.Integer({ minimum: 0 }) }), { maxItems: 30 }),
    documentTotalThisYear: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]*)$' })),
    monthlyTotals: Type.Optional(Type.Array(object({ month: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }), count: Type.Integer({ minimum: 0 }), amount: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }) }), { maxItems: 12 })),
    documentTypes: Type.Optional(Type.Array(object({ documentType: Type.Union([Type.String({ minLength: 1, maxLength: 255 }), Type.Null()]), count: Type.Integer({ minimum: 0 }), amount: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }) }), { maxItems: 6 })),
    // Año de las cifras anuales y gasto de ese año por proyecto y por cuenta de cada compra.
    year: Type.Optional(PurchaseYearSchema),
    availableYears: Type.Optional(Type.Array(Type.Integer({ minimum: 1, maximum: 9999 }), { uniqueItems: true, maxItems: 10000 })),
    lineTotal: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]*)$' })),
    projectCount: Type.Optional(Type.Integer({ minimum: 0 })),
    projects: Type.Optional(Type.Array(PurchaseBreakdownSchema, { maxItems: 40 })),
    accounts: Type.Optional(Type.Array(PurchaseBreakdownSchema, { maxItems: 8 })),
    recentRecords: Type.Array(object({ id: uuid, requestNumber: headerFields.requestNumber, description: headerFields.description,
      sentDate: date, totalAmount: amount, createdAt: stamp,
      source: Type.Union([Type.Literal('manual'), Type.Literal('image_capture'), Type.Literal('contract_example')]),
      projectCode: Type.Optional(Type.Union([PurchaseCodeSchema, Type.Null()])),
    }), { maxItems: 8 }),
  })),
}) });
export type PurchaseSummaryResponse = Static<typeof PurchaseSummaryResponseSchema>;
export const PurchaseCapabilitiesResponseSchema = object({ data: object({ sheetsSyncEnabled: Type.Boolean() }) });
export type PurchaseCapabilities = Static<typeof PurchaseCapabilitiesResponseSchema>['data'];
export const PurchaseSheetsQuerySchema = object({ purchaseId: Type.Optional(uuid) });
export const PurchaseSheetsResponseSchema = object({ data: object({
  status: Type.Union([Type.Literal('disabled'), Type.Literal('pending'), Type.Literal('synced'), Type.Literal('error')]),
  pending: Type.Integer({ minimum: 0 }), lastSyncedAt: Type.Union([stamp, Type.Null()]),
  url: Type.Union([Type.String({ pattern: '^https://docs\\.google\\.com/spreadsheets/d/[a-zA-Z0-9_-]+/edit$' }), Type.Null()]),
}) });
export type PurchaseSheetsResponse = Static<typeof PurchaseSheetsResponseSchema>;

const filterText = Type.String({ minLength: 1, maxLength: 255, pattern: '\\S' });
export const PurchaseFiltersSchema = object({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' })),
  dateFrom: Type.Optional(date), dateTo: Type.Optional(date),
  unitCode: Type.Optional(filterText), projectCode: Type.Optional(filterText), accountingCode: Type.Optional(filterText),
  paymentSituation: Type.Optional(filterText),
});
export type PurchaseFilters = Static<typeof PurchaseFiltersSchema>;
export const PurchaseListQuerySchema = object({ ...PurchaseFiltersSchema.properties,
  sort: Type.Optional(Type.Union([Type.Literal('dateDesc'), Type.Literal('dateAsc')])),
  page: Type.Integer({ minimum: 1, maximum: 1000000 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }) });
export type PurchaseListQuery = Static<typeof PurchaseListQuerySchema>;
const actor = object({ id: uuid, name: Type.String({ minLength: 1, maxLength: 200 }) });
const SourceSchema = Type.Union([Type.Literal('manual'), Type.Literal('contract_example'), Type.Literal('image_capture')]);
// Al leer se tolera un RUT guardado antes de normalizarlo; al editarlo se pide en el formato nuevo.
const StoredRecordSchema = object({ ...RecordSchema.properties, rut: nullable(Type.String({ minLength: 1, maxLength: EXTRACTION_LIMITS.textLength })) });
export const PurchaseRecordSchema = object({ ...PurchasePayloadSchema.properties, record: StoredRecordSchema, id: uuid, source: SourceSchema, exampleId: Type.Union([PurchaseExampleIdSchema, Type.Null()]),
  capture: Type.Optional(Type.Union([CaptureMetadataSchema, Type.Null()])), version: Type.Integer({ minimum: 1 }), createdAt: stamp, createdBy: actor });
export type PurchaseRecord = Static<typeof PurchaseRecordSchema>;
export const PurchaseResponseSchema = object({ data: PurchaseRecordSchema });
export const PurchaseListItemSchema = object({
  id: uuid, recordDate: date, requestNumber: headerFields.requestNumber, provider: nullable(text), description: headerFields.description,
  totalAmount: amount, documentType: nullable(text), unitCode: nullable(text), paymentSituation: text,
  version: PurchaseRecordSchema.properties.version, source: SourceSchema, exampleId: PurchaseRecordSchema.properties.exampleId,
});
export type PurchaseListItem = Static<typeof PurchaseListItemSchema>;
export const PurchaseListResponseSchema = object({ data: Type.Array(PurchaseListItemSchema),
  pagination: object({ page: Type.Integer({ minimum: 1 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }), total: Type.Integer({ minimum: 0 }) }),
  availableYears: Type.Optional(Type.Array(Type.Integer({ minimum: 1, maximum: 9999 }), { uniqueItems: true })),
  // Conteo por situación de pago con los demás filtros aplicados, para los botones Todas/Pendientes/Pagadas.
  paymentCounts: Type.Optional(object({ all: Type.Integer({ minimum: 0 }), pending: Type.Integer({ minimum: 0 }), paid: Type.Integer({ minimum: 0 }) })),
  totals: object({ currency: Type.Literal('CLP'), documentTotal: Type.String({ pattern: '^(0|[1-9][0-9]*)$' }) }) });
export type PurchaseListResponse = Static<typeof PurchaseListResponseSchema>;

// Catálogos para elegir unidad, proyecto y cuenta. `famed` marca lo que se ofrece primero; el resto sólo da nombre a un código.
const catalogName = Type.String({ minLength: 1, maxLength: 255 });
export const PurchaseCatalogResponseSchema = object({ data: object({
  units: Type.Array(object({ code: PurchaseCodeSchema, name: catalogName, famed: Type.Boolean() }), { maxItems: 1000 }),
  projects: Type.Array(object({ unitCode: PurchaseCodeSchema, code: PurchaseCodeSchema, name: catalogName }), { maxItems: 5000 }),
  accounts: Type.Array(object({ code: PurchaseCodeSchema, name: catalogName, famed: Type.Boolean(), item: nullable(text) }), { maxItems: 1000 }),
}) });
export type PurchaseCatalog = Static<typeof PurchaseCatalogResponseSchema>['data'];
// Lo último registrado para un proveedor, para sugerir su RUT y los mismos códigos.
export const PurchaseProvidersQuerySchema = object({ q: Type.String({ minLength: 2, maxLength: 100, pattern: '\\S' }) });
export const PurchaseProvidersResponseSchema = object({ data: Type.Array(object({
  provider: text, rut: nullable(RutSchema), unitCode: nullable(text), projectCode: nullable(text), accountingCode: nullable(text),
  requestNumber: headerFields.requestNumber, recordDate: date, count: Type.Integer({ minimum: 1 }),
}), { maxItems: 10 }) });
export type PurchaseProviderSuggestion = Static<typeof PurchaseProvidersResponseSchema>['data'][number];

export function validatePurchaseListQuery(input: unknown): ContractProblem[] {
  if (!Value.Check(PurchaseListQuerySchema, input)) return [...Value.Errors(PurchaseListQuerySchema, input)].map(error => ({ path: error.path, message: 'Revisa el formato o límite del filtro.' }));
  const problems: ContractProblem[] = [];
  for (const key of ['dateFrom', 'dateTo'] as const) {
    const value = input[key];
    if (value && (value.startsWith('0000-') || !validCalendarDate(value))) problems.push({ path: `/${key}`, message: 'Ingresa una fecha válida entre los años 0001 y 9999.' });
  }
  if (!problems.length && input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) problems.push({ path: '/dateTo', message: 'La fecha final debe ser igual o posterior a la inicial.' });
  return problems;
}
function schemaProblems(schema: TSchema, input: unknown): ContractProblem[] {
  return [...Value.Errors(schema, input)].map(error => ({ path: error.path,
    message: error.value === null || error.value === '' || error.value === undefined ? 'Completa este campo obligatorio.'
      : /\/(totalAmount|taxAmount|price|amount)$/.test(error.path) ? 'Escribe sólo números, por ejemplo 1234567 o 1.234.567.'
      : /\/(recordDate|sentDate)$/.test(error.path) ? 'Escribe una fecha válida en formato dd/mm/aaaa.'
      : error.path.endsWith('/rut') ? 'Escribe el RUT con su dígito verificador, por ejemplo 12.345.678-5.'
      : 'Revisa el formato o el límite de este campo.' }));
}
export function validateCreatePurchase(input: unknown): ContractProblem[] {
  if (!Value.Check(CreatePurchaseSchema, input)) return schemaProblems(CreatePurchaseSchema, input);
  return validatePurchasePayload({ record: input.record, oracle: input.oracle, lines: input.lines });
}
export function validatePurchasePayload(input: unknown): ContractProblem[] {
  if (!Value.Check(PurchasePayloadSchema, input)) return schemaProblems(PurchasePayloadSchema, input);
  const problems: ContractProblem[] = [];
  // PostgreSQL no tiene año cero; las fechas también deben existir en el calendario.
  for (const [path, value] of [['/record/recordDate', input.record.recordDate], ['/oracle/sentDate', input.oracle.sentDate]] as const) {
    if (value === null) continue;
    if (value.startsWith('0000-')) problems.push({ path, message: 'El año debe ser mayor que cero.' });
    else if (!validCalendarDate(value)) problems.push({ path, message: 'La fecha no existe en el calendario.' });
  }
  return problems;
}
