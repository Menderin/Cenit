import { createReviewDraft, validCalendarDate, type ExtractionResponse } from './extraction.js';
import { AREAS, DEFAULT_DOCUMENT, DEFAULT_PAYMENT_SITUATION, FAMED_ACCOUNTS } from './register.js';
import type { PurchasePayload, PurchaseRecordFields } from './records.js';

/** Lo que se edita en pantalla: cualquier campo puede estar vacío hasta guardar. */
export type PurchaseDraftRecord = { [K in keyof PurchaseRecordFields]: string | null };
export type PurchaseDraft = { record: PurchaseDraftRecord; oracle: PurchasePayload['oracle']; lines: PurchasePayload['lines'] };

// Reglas para llenar la fila del «Registro de gastos» desde una captura. Sólo proponen valores:
// la persona los revisa antes de guardar y nada se calcula si el texto no lo trae.

/** Dígito verificador chileno (módulo 11) de un cuerpo de RUT. */
export function rutCheckDigit(body: string) {
  let sum = 0, factor = 2;
  for (const digit of [...body].reverse()) { sum += Number(digit) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const rest = 11 - (sum % 11);
  return rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
}
/** Acepta «12.345.678-5», «12345678-5» o «123456785»; devuelve «12345678-5» o el texto tal cual si no tiene forma de RUT. */
export function normalizeRut(value: string) {
  const compact = value.trim().replace(/[.\s]/g, '').toUpperCase();
  const match = compact.match(/^0*([1-9][0-9]{0,8})-?([0-9K])$/);
  return match ? `${match[1]}-${match[2]}` : value.trim();
}
export function formatRut(normalized: string) {
  const match = normalized.match(/^([0-9]+)-([0-9K])$/);
  return match ? `${match[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${match[2]}` : normalized;
}
/** El RUT del proveedor que Oracle agrega al final del detalle (`…, NOMBRE_164823792`), sólo si su verificador cuadra. */
export function rutFromDescription(description: string | null) {
  if (!description) return null;
  for (const segment of description.split(' / ').reverse()) {
    const match = segment.trim().match(/_([0-9]{7,8})([0-9Kk])$/);
    if (match && !/^0+$/.test(match[1]!) && rutCheckDigit(match[1]!) === match[2]!.toUpperCase()) return `${Number(match[1])}-${match[2]!.toUpperCase()}`;
  }
  return null;
}
/** Número de boleta de honorarios: «BOL/75» en el detalle o «BH75» en el nombre del anexo. */
export function biFromText(...texts: Array<string | null>) {
  for (const value of texts) {
    const match = value?.match(/\bBOL\s*\/\s*(\d{1,10})/i) ?? value?.match(/(?:^|[^A-Z])BH(\d{1,10})/i);
    if (match) return String(Number(match[1]));
  }
  return null;
}
export function documentTypeFrom(description: string | null, attachment: string | null) {
  if (!description && !attachment) return null;
  return /SERVICIOS PROFESIONALES|\bBOL\s*\//i.test(description ?? '') || /(?:^|[^A-Z])BHE?\d/i.test(attachment ?? '') ? 'HONORARIOS' : 'COTIZACIÓN';
}
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** Columna UNIDAD: el departamento que nombra el detalle («DEPTO CLINICAS») o, si no hay, FAMED. */
export function areaFrom(description: string | null) {
  if (!description) return null;
  // Sin \b: en «BIOMEDICAS_76455102» el guion bajo cuenta como letra.
  const text = plain(description);
  if (/DEPTO\.?\s+(DE\s+)?CLINICAS?(?![A-Z0-9])/.test(text)) return 'CLINICA';
  if (/DEPTO\.?\s+(DE\s+)?CIENCIAS\s+BIOMEDICAS(?![A-Z0-9])/.test(text)) return 'CIENCIAS BIOMEDICAS';
  if (/DEPTO\.?\s+(DE\s+)?SALUD\s+PUBLICA(?![A-Z0-9])/.test(text)) return 'SALUD PUBLICA';
  return AREAS[0];
}
export const itemFromAccount = (code: string | null) => FAMED_ACCOUNTS.find(account => account.code === code?.trim())?.item ?? null;
/** «01.02.270101.00000000.410103» → universidad, sede, unidad, proyecto y cuenta. */
export function splitChargeAccount(value: string | null) {
  const parts = value?.trim().match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1);
  return parts ? { universityCode: parts[0]!, campusCode: parts[1]!, unitCode: parts[2]!, projectCode: parts[3]!, accountingCode: parts[4]! } : null;
}
/** Fecha que el sistema operativo pone en el nombre de la captura («Captura de pantalla 2026-01-09 a la(s)…»). */
export function recordDateFromFileName(name: string) {
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  const value = match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  return value && !value.startsWith('0000') && validCalendarDate(value) ? value : null;
}
const isoDate = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export type RecordSource = 'read' | 'suggested';
export type RecordSources = Partial<Record<keyof PurchaseRecordFields, RecordSource>> & { rutFromPurchase?: string };
export type CaptureDateSource = 'filename' | 'modified' | 'today';
export const emptyRecord = (): PurchaseDraftRecord => ({ recordDate: null, document: DEFAULT_DOCUMENT, requestNumber: null,
  provider: null, description: null, totalAmount: null, documentType: null, bi: null, unitCode: null, projectCode: null,
  accountingCode: null, rut: null, area: null, item: null, paymentSituation: DEFAULT_PAYMENT_SITUATION });
export const emptyDraft = (): PurchaseDraft => ({ record: emptyRecord(),
  oracle: { sentDate: null, sentTime: null, oracleId: null, sender: null, recipient: null, taxAmount: null, attachmentReference: null }, lines: [] });

/** Convierte la lectura de una captura de Oracle en la fila de la planilla, marcando qué se leyó y qué propone Cenit. */
export function draftFromExtraction(response: ExtractionResponse, file: { name: string; lastModified?: number }, today = new Date()): { draft: PurchaseDraft; sources: RecordSources; dateSource: CaptureDateSource } {
  const values = createReviewDraft(response), header = values.header, first = values.lines[0];
  const record = emptyRecord(), sources: RecordSources = {};
  const read = (key: keyof PurchaseDraftRecord, value: string | null | undefined) => { if (value) { record[key] = value; sources[key] = 'read'; } };
  const suggest = (key: keyof PurchaseDraftRecord, value: string | null | undefined) => { if (value && !record[key]) { record[key] = value; sources[key] = 'suggested'; } };
  read('requestNumber', header.requestNumber);
  read('description', header.description ?? first?.description);
  read('totalAmount', header.totalAmount ?? first?.amount);
  read('provider', first?.provider);
  const account = splitChargeAccount(first?.chargeAccount ?? null);
  read('unitCode', first?.unitCode ?? account?.unitCode);
  read('projectCode', first?.projectCode ?? account?.projectCode);
  read('accountingCode', first?.accountingCode ?? account?.accountingCode);
  const namedDate = recordDateFromFileName(file.name);
  const dateSource = namedDate ? 'filename' : file.lastModified ? 'modified' : 'today';
  suggest('recordDate', namedDate ?? isoDate(file.lastModified ? new Date(file.lastModified) : today));
  suggest('rut', rutFromDescription(record.description) ?? rutFromDescription(first?.description ?? null));
  const type = documentTypeFrom(record.description, header.attachmentReference);
  suggest('documentType', type);
  suggest('bi', biFromText(record.description, header.attachmentReference) ?? (type === 'COTIZACIÓN' ? 'S/N' : null));
  suggest('area', areaFrom(record.description));
  suggest('item', itemFromAccount(record.accountingCode));
  const lines = values.lines.map(line => ({ ...line, ...(line.chargeAccount && !line.unitCode ? splitChargeAccount(line.chargeAccount) ?? {} : {}) }));
  return { draft: { record, lines, oracle: { sentDate: header.sentDate, sentTime: header.sentTime, oracleId: header.oracleId, sender: header.sender,
    recipient: header.recipient, taxAmount: header.taxAmount, attachmentReference: header.attachmentReference } }, sources, dateSource };
}
