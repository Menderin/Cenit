import { normalizeRut, validatePurchasePayload, type ContractProblem, type PurchaseDraft, type PurchasePayload } from '@cenit/contracts/purchases';
import { normalizeAmountInput } from './fields.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
/** Fecha de hoy en Santiago: en el registro a mano la Fecha es el día en que se registra. */
export const todayInSantiago = today;

/** Limpia lo escrito antes de enviar (RUT con puntos, montos con separador de miles) sin inventar valores. */
export function preparePayload(draft: PurchaseDraft): PurchasePayload {
  const trim = (value: string | null) => value?.trim() ? value.trim() : null;
  const record = Object.fromEntries(Object.entries(draft.record).map(([key, value]) => [key, key === 'description' ? (value?.trim() ? value : null) : trim(value)])) as PurchaseDraft['record'];
  if (record.rut) record.rut = normalizeRut(record.rut);
  if (record.totalAmount) record.totalAmount = normalizeAmountInput(record.totalAmount);
  const oracle = { ...draft.oracle, taxAmount: draft.oracle.taxAmount ? normalizeAmountInput(draft.oracle.taxAmount) : null };
  return { record, oracle, lines: draft.lines } as PurchasePayload;
}
export function payloadProblems(payload: PurchasePayload): ContractProblem[] { return validatePurchasePayload(payload); }
