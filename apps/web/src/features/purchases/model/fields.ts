import { lineFieldLabels, oracleFieldLabels, recordFieldLabels, type ExtractionResponse, type PurchaseDraft } from '@cenit/contracts/purchases';

export const recordLabels: Record<string, string> = recordFieldLabels;
export const oracleLabels: Record<string, string> = oracleFieldLabels;
/** Nombre visible de un error o un recuadro de la captura: la columna de la planilla, el dato de Oracle o la línea. */
export function purchaseProblemLabel(path: string) {
  const parts = path.split('/').filter(Boolean), field = parts.at(-1) ?? '';
  if (parts[0] === 'record') return recordLabels[field] ?? 'Registro de gastos';
  if (parts[0] === 'oracle' || parts[0] === 'header') return recordLabels[field] ?? oracleLabels[field] ?? 'Datos de Oracle';
  if (parts[0] === 'lines') {
    const label = (lineFieldLabels as Record<string, string>)[field] ?? 'Línea de Oracle';
    return /^\d+$/.test(parts[1] ?? '') ? `Línea ${Number(parts[1]) + 1} · ${label}` : label;
  }
  return 'Datos de la compra';
}
/** Ruta del campo de la captura que respalda cada columna de la fila, para ubicarla en la imagen. */
export const captureSourcePath: Partial<Record<keyof PurchaseDraft['record'], string>> = {
  requestNumber: '/header/requestNumber', description: '/header/description', totalAmount: '/header/totalAmount', provider: '/lines/0/provider',
  unitCode: '/lines/0/chargeAccount', projectCode: '/lines/0/chargeAccount', accountingCode: '/lines/0/chargeAccount', rut: '/header/description',
  bi: '/header/description', documentType: '/header/description',
};
export const hasRegion = (extraction: ExtractionResponse | null, path?: string) => !!path && !!extraction?.data.regions?.some(region => region.path === path);

export const dateLabel = (date: string) => date.split('-').reverse().join('/');
const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const amountLabel = (value: string | null) => value === null ? 'Sin dato' : /^(0|[1-9]\d*)$/.test(value) ? currency.format(BigInt(value)) : value;
export const amountFields = new Set(['totalAmount', 'taxAmount', 'price', 'amount']);
export const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Acepta separadores de miles chilenos («$1.250.000», «1 250 000») y devuelve el entero canónico.
// Las comas y otros formatos quedan tal cual para que la validación los explique.
export function normalizeAmountInput(value: string) {
  const trimmed = value.trim().replace(/^\$\s*/, '');
  if (!/^\d{1,3}(?:[.\s]\d{3})+$|^\d+$/.test(trimmed)) return value;
  return trimmed.replace(/[.\s]/g, '').replace(/^0+(?=\d)/, '');
}
// Oracle suele guardar en mayúsculas («COTIZACIÓN»); sólo se suaviza lo que se muestra, nunca la copia guardada.
export const sentenceCase = (value: string) => value === value.toLocaleUpperCase('es-CL') ? value.charAt(0) + value.slice(1).toLocaleLowerCase('es-CL') : value;
export const isPaid = (situation: string | null) => situation === 'PAGADO';
/** Lo que dice la pastilla de una compra sin pagar: «Pendiente» o el valor que se anotó antes (p. ej. «En revisión»). */
export const unpaidLabel = (situation: string) => situation === 'PENDIENTE' ? 'Pendiente' : sentenceCase(situation);
