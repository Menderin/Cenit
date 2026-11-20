import { calendarDate } from '../../../shared/lib/dates.js';

export type { ServiceCommission as CommissionDraft } from '@cenit/contracts';
import type { ServiceCommission as CommissionDraft } from '@cenit/contracts';
export type FundingRow = CommissionDraft['funding'][number];
export type Step = 'funcionario' | 'comision' | 'financiamiento' | 'actividad' | 'revision';
export type Errors = Partial<Record<string, string>>;

const emptyRow = (): FundingRow => ({ institution: '', organization: '', unit: '', project: '', percent: '' });
export const emptyCommission = (): CommissionDraft => ({
  name: '', position: '', unit: '', group: '', category: '', categoryOther: '', plant: '', territory: '', place: '',
  from: '', to: '', daysWithStay: '', daysWithoutStay: '', totalDays: '', allowance: '', currency: '',
  funding: [emptyRow(), emptyRow()], activity: 'evento',
  eventName: '', eventOrganizer: '', eventWork: '', eventProject: '', eventNotes: '', description: '',
});

export const steps: { key: Step; label: string; intro: string }[] = [
  { key: 'funcionario', label: 'Funcionario', intro: 'Datos de quien realiza la comisión.' },
  { key: 'comision', label: 'Comisión', intro: 'Lugar, fechas, días y viático.' },
  { key: 'financiamiento', label: 'Financiamiento', intro: 'Código presupuestario y porcentaje de cada fuente.' },
  { key: 'actividad', label: 'Actividad', intro: 'Evento al que asiste o descripción de la comisión.' },
  { key: 'revision', label: 'Revisión', intro: 'Revisa los datos; al final podrás ver, descargar o imprimir el documento.' },
];

// Orden de los campos en pantalla: el foco va al primero con error.
export const stepFields: Record<Exclude<Step, 'revision'>, string[]> = {
  funcionario: ['name', 'position', 'unit', 'group', 'category', 'categoryOther', 'plant'],
  comision: ['territory', 'place', 'from', 'to', 'daysWithStay', 'daysWithoutStay', 'totalDays', 'allowance', 'currency'],
  financiamiento: [0, 1].flatMap(row => ['institution', 'organization', 'unit', 'project', 'percent'].map(key => `funding.${row}.${key}`)),
  actividad: ['eventName', 'eventOrganizer', 'eventProject', 'eventWork', 'eventNotes', 'description'],
};

export function validateStep(draft: CommissionDraft, step: Step): Errors {
  const errors: Errors = {};
  const required = (key: keyof CommissionDraft, message: string) => { if (!String(draft[key]).trim()) errors[key] = message; };
  if (step === 'funcionario') {
    required('name', 'Ingresa el nombre completo.');
    required('position', 'Ingresa el cargo.');
    required('unit', 'Ingresa la unidad o dependencia.');
    required('group', 'Elige el grupo.');
    required('category', 'Elige el estamento.');
    if (draft.category === 'otro') required('categoryOther', 'Especifica el estamento.');
    required('plant', 'Elige la planta.');
  }
  if (step === 'comision') {
    required('territory', 'Elige dónde se realiza la comisión.');
    required('place', draft.territory === 'extranjero' ? 'Ingresa ciudad y país.' : 'Ingresa el lugar.');
    const from = calendarDate(draft.from), to = calendarDate(draft.to);
    if (!draft.from) errors.from = 'Ingresa la fecha de inicio.'; else if (!from) errors.from = 'Revisa la fecha de inicio.';
    if (!draft.to) errors.to = 'Ingresa la fecha de término.'; else if (!to) errors.to = 'Revisa la fecha de término.';
    else if (from && to < from) errors.to = 'Debe ser igual o posterior al inicio.';
    for (const key of ['daysWithStay', 'daysWithoutStay'] as const) if (draft[key].trim() && !/^\d+$/.test(draft[key].trim())) errors[key] = 'Usa sólo números enteros.';
    if (!draft.totalDays.trim()) errors.totalDays = 'Ingresa el total de días.';
    else if (!/^(\d+([.,]\d)?|\d*\s?(½|1\/2))$/.test(draft.totalDays.trim())) errors.totalDays = 'Usa un número; para medio día escribe ½ o 0,5.';
    if (draft.allowance.trim()) {
      if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(draft.allowance.trim())) errors.allowance = 'Usa sólo números; separa miles con punto.';
      if (!draft.currency) errors.currency = 'Elige la moneda.';
    }
  }
  if (step === 'financiamiento') draft.funding.forEach((row, index) => {
    const filled = Object.values(row).some(value => value.trim());
    if (index === 1 && !filled) return;
    for (const [key, value] of Object.entries(row)) {
      const path = `funding.${index}.${key}`, text = value.trim();
      if (!text) errors[path] = index === 0 ? 'Obligatorio.' : 'Completa o vacía la fila.';
      else if (key !== 'percent' && !/^\d+$/.test(text)) errors[path] = 'Sólo dígitos.';
      else if (key === 'percent') { const n = Number(text.replace(',', '.')); if (!/^\d{1,3}([.,]\d{1,2})?$/.test(text) || n <= 0 || n > 100) errors[path] = 'Entre 1 y 100.'; }
    }
  });
  if (step === 'actividad') {
    if (draft.activity === 'evento') { required('eventName', 'Ingresa el nombre del evento.'); required('eventOrganizer', 'Ingresa la institución organizadora.'); }
    else required('description', 'Describe la comisión.');
  }
  // Límites del contrato del servidor, aplicados sin recortar la entrada.
  const limits: Partial<Record<keyof CommissionDraft, number>> = {
    name: 500, position: 500, unit: 500, categoryOther: 500, place: 500,
    daysWithStay: 16, daysWithoutStay: 16, totalDays: 16, allowance: 32,
    eventName: 500, eventOrganizer: 500, eventWork: 2000, eventProject: 500, eventNotes: 500, description: 2000,
  };
  for (const key of stepFields[step as Exclude<Step, 'revision'>] ?? []) {
    if ((key === 'categoryOther' && draft.category !== 'otro') || (key.startsWith('event') && draft.activity !== 'evento') || (key === 'description' && draft.activity !== 'descripcion')) continue;
    const limit = limits[key as keyof CommissionDraft], value = draft[key as keyof CommissionDraft];
    if (limit && typeof value === 'string' && [...value].length > limit) errors[key] = `Usa como máximo ${limit} caracteres.`;
  }
  if (step === 'financiamiento') draft.funding.forEach((row, index) => {
    for (const [key, value] of Object.entries(row)) {
      const limit = key === 'percent' ? 16 : 32;
      if ([...value].length > limit) errors[`funding.${index}.${key}`] = `Usa como máximo ${limit} caracteres.`;
    }
  });
  return errors;
}

export const categoryLabels = { academico: 'Académico', no_academico: 'No académico', directivo: 'Directivo superior o exclusiva confianza', otro: 'Otro' } as const;
export const plantLabels = { oficial: 'Planta oficial', especial: 'Planta especial', temporal: 'Planta temporal' } as const;

export function fileName(draft: CommissionDraft) {
  const words = draft.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(-2).join('-');
  return ['comision-servicios', words, draft.from].filter(Boolean).join('-');
}

// Formatos impresos del XLSM: d/mmm/yy y miles con dos decimales.
export function commissionDate(value: string) {
  if (!calendarDate(value)) return value;
  const [year, month, day] = value.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  return `${Number(day)}/${months[Number(month) - 1]}/${year!.slice(-2)}`;
}
export function commissionAllowance(value: string) {
  if (!value.trim()) return '';
  const [integer, decimals = ''] = value.trim().split(',');
  return `${integer!.replaceAll('.', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals.padEnd(2, '0')}`;
}
