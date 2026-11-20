import { headerFields, lineFields, administrativeFields, type ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { purchaseFieldLabels } from '@cenit/contracts/purchases';
export const purchaseLabels = purchaseFieldLabels;
export function purchaseProblemLabel(path: string) {
  const parts = path.split('/').filter(Boolean), field = parts.at(-1) ?? '';
  const label = purchaseLabels[field] ?? (parts[0] === 'lines' ? 'Ítems de la solicitud' : 'Datos de la solicitud');
  return parts[0] === 'lines' && /^\d+$/.test(parts[1] ?? '') ? `Ítem ${Number(parts[1]) + 1} · ${label}` : label;
}
const exampleLabels: Record<string, string> = { recovered: 'Completo', partial: 'Parcial', ambiguous: 'Por aclarar' };
export const purchaseExampleLabel = (id: string | null) => exampleLabels[id ?? ''] ?? 'Ejemplo';
export const emptyFields = (fields: Record<string, unknown>) => Object.fromEntries(Object.keys(fields).map(key => [key, null]));
export const emptyLine = () => emptyFields(lineFields) as ExtractionReviewDraft['lines'][number];
export const emptyDraft = (): ExtractionReviewDraft => ({ header: emptyFields(headerFields) as ExtractionReviewDraft['header'], lines: [], administrative: emptyFields(administrativeFields) as ExtractionReviewDraft['administrative'] });
export const dateLabel = (date: string) => date.split('-').reverse().join('/');
const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const amountLabel = (value: string | null) => value === null ? 'Sin dato' : /^(0|[1-9]\d*)$/.test(value) ? currency.format(BigInt(value)) : value;
export const amountFields = new Set(['totalAmount', 'taxAmount', 'price', 'amount']);
export const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Accepts Chilean thousands separators («$1.250.000», «1 250 000») and returns the canonical integer string.
// Commas and other formats stay as typed so validation can still explain them.
export function normalizeAmountInput(value: string) {
  const trimmed = value.trim().replace(/^\$\s*/, '');
  if (!/^\d{1,3}(?:[.\s]\d{3})+$|^\d+$/.test(trimmed)) return value;
  const digits = trimmed.replace(/[.\s]/g, '').replace(/^0+(?=\d)/, '');
  return digits;
}
// Oracle often stores types in capitals («COTIZACIÓN»); only the display is softened, the stored copy is untouched.
export const sentenceCase = (value: string) => value === value.toLocaleUpperCase('es-CL') ? value.charAt(0) + value.slice(1).toLocaleLowerCase('es-CL') : value;
