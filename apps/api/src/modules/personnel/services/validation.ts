import type { ServiceCommission } from '@cenit/contracts/personnel';

// Reglas provisionales de la pantalla actual; no constituyen validación institucional.
export function controlCharErrors(draft: object): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (typeof value === 'string' && [...value].some(char => { const code = char.codePointAt(0)!; return (code < 32 && code !== 10) || (code >= 127 && code <= 159); })) errors[key] = 'Contiene caracteres de control no admitidos.';
  }
  return errors;
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const d = new Date(0); d.setUTCHours(12, 0, 0, 0); d.setUTCFullYear(year, month - 1, day);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function validateCommission(draft: ServiceCommission): Record<string, string> {
  const errors = controlCharErrors(draft);
  const required = (key: keyof ServiceCommission) => { if (!String(draft[key]).trim()) errors[key] = 'Este campo es obligatorio.'; };
  for (const key of ['name', 'position', 'unit', 'group', 'category', 'plant', 'territory', 'place', 'totalDays'] as const) required(key);
  if (draft.category === 'otro') required('categoryOther');
  const date = isCalendarDate;
  if (!date(draft.from)) errors.from = 'Ingresa una fecha válida.';
  if (!date(draft.to)) errors.to = 'Ingresa una fecha válida.';
  else if (!errors.from && draft.to < draft.from) errors.to = 'Debe ser igual o posterior al inicio.';
  for (const key of ['daysWithStay', 'daysWithoutStay'] as const) if (draft[key].trim() && !/^\d+$/.test(draft[key].trim())) errors[key] = 'Usa sólo números enteros.';
  if (draft.totalDays.trim() && !/^(\d+([.,]\d)?|\d*\s?(½|1\/2))$/.test(draft.totalDays.trim())) errors.totalDays = 'Ingresa un número de días válido.';
  if (draft.allowance.trim()) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(draft.allowance.trim())) errors.allowance = 'Ingresa un importe válido.';
    if (!draft.currency) errors.currency = 'Elige la moneda.';
  }
  draft.funding.forEach((row, index) => {
    if (index === 1 && !Object.values(row).some(value => value.trim())) return;
    for (const [key, value] of Object.entries(row)) {
      const path = `funding.${index}.${key}`, text = value.trim();
      if (!text) errors[path] = 'Completa la fila.';
      else if (key !== 'percent' && !/^\d+$/.test(text)) errors[path] = 'Usa sólo dígitos.';
      else if (key === 'percent' && (!/^\d{1,3}([.,]\d{1,2})?$/.test(text) || Number(text.replace(',', '.')) <= 0 || Number(text.replace(',', '.')) > 100)) errors[path] = 'Ingresa un porcentaje mayor que cero y hasta 100.';
    }
  });
  if (draft.activity === 'evento') { required('eventName'); required('eventOrganizer'); }
  else required('description');
  return errors;
}
