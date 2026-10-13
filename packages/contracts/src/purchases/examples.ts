import type { ErrorResponse } from '../common/index.js';
import { headerFields, lineFields, administrativeFields, type ExtractionResponse } from './index.js';
const empty = (fields: Record<string, unknown>) => Object.fromEntries(Object.keys(fields).map(key => [key, { status: 'missing', value: null, rawText: null }]));
const recovered = (value: string, rawText = value) => ({ status: 'recovered' as const, value, rawText });
// Wholly fictitious fixtures: not OCR output and not copied from institutional records.
export const recoveredExample: ExtractionResponse = { data: {
  extractionId: '123e4567-e89b-42d3-a456-426614174001', status: 'reviewRequired',
  input: { name: 'solicitud-ficticia.png', mimeType: 'image/png', bytes: 120000, width: 1100, height: 700 },
  header: { ...empty(headerFields), requestNumber: recovered('000125'), oracleId: recovered('demo-000325'), sender: recovered('Solicitante Demo'), recipient: recovered('Destinatario Demo'), sentDate: recovered('2026-10-12', '12-Oct-2026'), sentTime: recovered('10:30:00'), description: recovered('Insumos de demostración'), totalAmount: recovered('200000', '200.000 CLP'), taxAmount: recovered('0', '0 CLP'), attachmentReference: recovered('Anexo ficticio') } as ExtractionResponse['data']['header'],
  lines: [{ ...empty(lineFields), description: recovered('Material de prueba'), provider: recovered('Proveedor Ficticio A'), costCenter: recovered('Centro ficticio'), lineUnit: recovered('1'), quantity: recovered('2'), price: recovered('100000'), amount: recovered('200000'), chargeAccount: recovered('01.02.270101.00000000.420405'), universityCode: recovered('01'), campusCode: recovered('02'), unitCode: recovered('270101'), projectCode: recovered('00000000'), accountingCode: recovered('420405') } as ExtractionResponse['data']['lines'][number]],
  administrative: empty(administrativeFields) as ExtractionResponse['data']['administrative'], issues: [],
} };
recoveredExample.data.lines[0]!.price = recovered('50000');
recoveredExample.data.lines[0]!.amount = recovered('100000');
recoveredExample.data.lines.push({ ...structuredClone(recoveredExample.data.lines[0]!), provider: recovered('Proveedor Ficticio B'), quantity: recovered('1'), price: recovered('100000') });
export const partialExample: ExtractionResponse = structuredClone(recoveredExample);
partialExample.data.extractionId = '123e4567-e89b-42d3-a456-426614174002';
partialExample.data.header.sentTime = { status: 'missing', value: null, rawText: null };
partialExample.data.lines[0]!.provider = { status: 'missing', value: null, rawText: null };
partialExample.data.issues = [{ path: '/lines/0/provider', code: 'MISSING_FIELD', message: 'La muestra no aporta un proveedor legible.' }];
export const ambiguousExample: ExtractionResponse = structuredClone(recoveredExample);
ambiguousExample.data.extractionId = '123e4567-e89b-42d3-a456-426614174003';
ambiguousExample.data.header.totalAmount = { status: 'ambiguous', value: null, rawText: '200.?00 CLP' };
ambiguousExample.data.header.sentDate = { status: 'invalid', value: null, rawText: '31/02/2026' };
ambiguousExample.data.issues = [{ path: '/header/totalAmount', code: 'AMBIGUOUS_VALUE', message: 'El monto no se puede determinar sin revisión.' }, { path: '/header/sentDate', code: 'INVALID_VALUE', message: 'La fecha de la muestra no existe.' }];
export const extractionExamples = [
  { id: 'recovered', label: 'Candidatos recuperados', response: recoveredExample },
  { id: 'partial', label: 'Resultado parcial', response: partialExample },
  { id: 'ambiguous', label: 'Valores ambiguos', response: ambiguousExample },
] as const;
const error = (code: string, message: string): ErrorResponse => ({ error: { code, message, requestId: 'fictitious-request' } });
export const extractionErrorExamples = [
  { status: 400, body: error('VALIDATION_ERROR', 'Revisa la estructura de la entrada.') },
  { status: 401, body: error('AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.') },
  { status: 403, body: error('FORBIDDEN', 'No tienes acceso a extracción de compras.') },
  { status: 413, body: error('PAYLOAD_TOO_LARGE', 'La imagen supera 5 MiB.') },
  { status: 415, body: error('UNSUPPORTED_MEDIA_TYPE', 'Sólo se admite PNG o JPEG.') },
  { status: 422, body: error('INVALID_IMAGE', 'La entrada no es una imagen válida.') },
  { status: 422, body: error('IMAGE_DIMENSIONS_EXCEEDED', 'La imagen supera 20 megapíxeles.') },
  { status: 422, body: error('EXTRACTION_NO_DATA', 'No se recuperaron datos; revisa la imagen y vuelve a intentar.') },
  { status: 503, body: error('EXTRACTION_UNAVAILABLE', 'El procesador no está disponible.') },
  { status: 500, body: error('INTERNAL_ERROR', 'No fue posible completar la operación.') },
];
