import { Type, type Static, type TSchema, type TProperties } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const EXTRACTION_LIMITS = { maxBytes: 5 * 1024 * 1024, maxPixels: 20_000_000, maxLines: 100, textLength: 255, descriptionLength: 1000 } as const;
export const EXTRACTION_ROUTE = '/api/v1/purchases/extractions';
export const CaptureMetadataSchema = Type.Object({
  type: Type.Literal('image_capture'),
  extractionId: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
  processorVersion: Type.String({ minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9._-]+$' }),
  processedAt: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' }),
}, { additionalProperties: false });
export const CaptureOriginSchema = Type.Object({ ...CaptureMetadataSchema.properties,
  receipt: Type.String({ minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]+$' }),
}, { additionalProperties: false });
export type CaptureOrigin = Static<typeof CaptureOriginSchema>;
export const CaptureLayoutSchema = Type.Object({
  status: Type.Union([Type.Literal('compatible'), Type.Literal('partial')]),
  signals: Type.Array(Type.Union([Type.Literal('request_title'), Type.Literal('header_fields'), Type.Literal('line_section'), Type.Literal('eight_column_table')]), { uniqueItems: true, maxItems: 4 }),
}, { additionalProperties: false });
const text = Type.String({ minLength: 1, maxLength: EXTRACTION_LIMITS.textLength, pattern: '\\S' });
const description = Type.String({ minLength: 1, maxLength: EXTRACTION_LIMITS.descriptionLength, pattern: '\\S' });
const amount = Type.String({ minLength: 1, maxLength: EXTRACTION_LIMITS.textLength, pattern: '^(0|[1-9][0-9]*)$' });
const date = Type.String({ pattern: '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' });
const time = Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' });
const object = <T extends TProperties>(properties: T) => Type.Object(properties, { additionalProperties: false });
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const ExtractionInputMetadataSchema = object({
  name: text, mimeType: Type.Union([Type.Literal('image/png'), Type.Literal('image/jpeg')]),
  bytes: Type.Integer({ minimum: 1, maximum: EXTRACTION_LIMITS.maxBytes }),
  width: Type.Integer({ minimum: 1, maximum: EXTRACTION_LIMITS.maxPixels }),
  height: Type.Integer({ minimum: 1, maximum: EXTRACTION_LIMITS.maxPixels }),
});
export type ExtractionInputMetadata = Static<typeof ExtractionInputMetadataSchema>;

export const headerFields = {
  requestNumber: text, oracleId: text, sender: text, recipient: text, sentDate: date, sentTime: time,
  description, totalAmount: amount, taxAmount: amount, attachmentReference: text,
};
export const lineFields = {
  description, provider: text, costCenter: text, lineUnit: text, quantity: text, price: amount, amount,
  chargeAccount: text, universityCode: text, campusCode: text, unitCode: text, projectCode: text, accountingCode: text,
};
export const administrativeFields = { document: text, documentType: text, bi: text, rut: text, unitName: text, item: text, paymentSituation: text };
function candidate<T extends TSchema>(schema: T) {
  const raw = nullable(Type.String({ minLength: 1, maxLength: schema.maxLength ?? EXTRACTION_LIMITS.textLength, pattern: '\\S' }));
  return Type.Union([
    object({ status: Type.Literal('recovered'), value: schema, rawText: raw }),
    object({ status: Type.Literal('missing'), value: Type.Null(), rawText: Type.Null() }),
    object({ status: Type.Literal('invalid'), value: Type.Null(), rawText: raw }),
    object({ status: Type.Literal('ambiguous'), value: Type.Null(), rawText: raw }),
  ]);
}
function candidates<T extends TProperties>(fields: T) {
  return object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, candidate(schema)])) as unknown as { [K in keyof T]: ReturnType<typeof candidate<T[K]>> });
}
function draftFields<T extends TProperties>(fields: T) {
  return object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, nullable(schema)])) as { [K in keyof T]: ReturnType<typeof nullable<T[K]>> });
}
export const ExtractionIssueSchema = object({
  path: Type.String({ minLength: 1, maxLength: 255, pattern: '^/' }),
  code: Type.Union([Type.Literal('MISSING_FIELD'), Type.Literal('INVALID_VALUE'), Type.Literal('AMBIGUOUS_VALUE'), Type.Literal('FIELD_LIMIT_EXCEEDED'), Type.Literal('LINE_LIMIT_EXCEEDED'), Type.Literal('TABLE_STRUCTURE_UNRECOGNIZED')]),
  message: description,
});
export const ExtractionResponseSchema = object({ data: object({
  extractionId: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
  status: Type.Literal('reviewRequired'), input: ExtractionInputMetadataSchema,
  origin: Type.Optional(CaptureOriginSchema),
  captureLayout: Type.Optional(CaptureLayoutSchema),
  header: candidates(headerFields), lines: Type.Array(candidates(lineFields), { maxItems: EXTRACTION_LIMITS.maxLines }),
  administrative: candidates(administrativeFields), issues: Type.Array(ExtractionIssueSchema, { maxItems: 2000 }),
}) });
export type ExtractionResponse = Static<typeof ExtractionResponseSchema>;
export type ExtractionCandidate = ExtractionResponse['data']['header']['sender'];
export const ExtractionReviewDraftSchema = object({
  header: draftFields(headerFields), lines: Type.Array(draftFields(lineFields), { maxItems: EXTRACTION_LIMITS.maxLines }),
  administrative: draftFields(administrativeFields),
});
export type ExtractionReviewDraft = Static<typeof ExtractionReviewDraftSchema>;
export type ContractProblem = { path: string; message: string };
export function validateInputMetadata(input: unknown): ContractProblem[] {
  if (!Value.Check(ExtractionInputMetadataSchema, input)) return [...Value.Errors(ExtractionInputMetadataSchema, input)].map(e => ({ path: e.path, message: 'Metadato de imagen inválido.' }));
  return input.width * input.height > EXTRACTION_LIMITS.maxPixels ? [{ path: '/width', message: 'La imagen supera 20 megapíxeles.' }] : [];
}
export function validCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(0); parsed.setUTCFullYear(year!, month! - 1, day!); parsed.setUTCHours(0, 0, 0, 0);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}
export function validateReviewDraft(input: unknown): ContractProblem[] {
  const problems = [...Value.Errors(ExtractionReviewDraftSchema, input)].map(e => ({ path: e.path, message: 'Revisa el formato o límite del campo.' }));
  if (Value.Check(ExtractionReviewDraftSchema, input) && input.header.sentDate !== null && !validCalendarDate(input.header.sentDate)) problems.push({ path: '/header/sentDate', message: 'La fecha no existe en el calendario.' });
  return problems;
}
export function validateExtractionResponse(input: unknown): ContractProblem[] {
  if (!Value.Check(ExtractionResponseSchema, input)) return [...Value.Errors(ExtractionResponseSchema, input)].map(e => ({ path: e.path, message: 'Candidato o estructura inválidos.' }));
  const problems = validateInputMetadata(input.data.input).map(e => ({ ...e, path: '/data/input' + e.path }));
  const layout = input.data.captureLayout;
  if (layout) {
    const admitted = (layout.signals.includes('request_title') && layout.signals.includes('header_fields')) || (layout.signals.includes('line_section') && layout.signals.includes('eight_column_table'));
    if (!admitted || (layout.status === 'compatible') !== (layout.signals.length === 4)) problems.push({ path: '/data/captureLayout', message: 'Las señales del formato no concuerdan con su estado.' });
  }
  if (input.data.origin && (input.data.origin.extractionId !== input.data.extractionId || !Number.isFinite(Date.parse(input.data.origin.processedAt)))) problems.push({ path: '/data/origin', message: 'Procedencia incompatible.' });
  const field = input.data.header.sentDate;
  if (field.status === 'recovered' && !validCalendarDate(field.value)) problems.push({ path: '/data/header/sentDate', message: 'La fecha no existe en el calendario.' });
  const groups = [['/header', input.data.header], ['/administrative', input.data.administrative], ...input.data.lines.map((line, i) => [`/lines/${i}`, line] as const)] as const;
  const paths = new Set<string>();
  for (const [prefix, fields] of groups) for (const [key, value] of Object.entries(fields)) {
    const path = `${prefix}/${key}`; paths.add(path);
    if (['invalid', 'ambiguous'].includes(value.status) && !input.data.issues.some(issue => issue.path === path)) problems.push({ path: '/data' + path, message: 'El campo necesita una incidencia explícita.' });
  }
  paths.add('/lines');
  for (const issue of input.data.issues) if (!paths.has(issue.path)) problems.push({ path: '/data/issues', message: 'La incidencia debe referirse a un campo existente.' });
  return problems;
}
export function createReviewDraft(response: ExtractionResponse): ExtractionReviewDraft {
  const values = (fields: Record<string, { value: string | null }>) => Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  return { header: values(response.data.header), lines: response.data.lines.map(values), administrative: values(response.data.administrative) } as ExtractionReviewDraft;
}
