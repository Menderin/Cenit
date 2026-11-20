import type { LeaveRequest } from '@cenit/contracts/personnel';
import { controlCharErrors, isCalendarDate } from './validation.js';

/** Dígito verificador del RUT (módulo 11). Acepta puntos y guion opcionales. */
export function validRut(value: string) {
  const match = /^(\d{1,2}(?:\.?\d{3}){2})-?([\dkK])$/.exec(value.trim());
  if (!match) return false;
  const digits = match[1]!.replace(/\./g, '');
  let sum = 0, factor = 2;
  for (let i = digits.length - 1; i >= 0; i--) { sum += Number(digits[i]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const rest = 11 - (sum % 11), expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return match[2]!.toUpperCase() === expected;
}

// Reglas provisionales de la propuesta (ver preguntas PER-02 y PER-03); no constituyen validación institucional.
export function validateLeave(draft: LeaveRequest): Record<string, string> {
  const errors = controlCharErrors(draft);
  const required = (key: keyof LeaveRequest) => { if (!draft[key].trim()) errors[key] = 'Este campo es obligatorio.'; };
  for (const key of ['name', 'rut', 'unit', 'type'] as const) required(key);
  if (draft.rut.trim() && !validRut(draft.rut)) errors.rut = 'Ingresa un RUT válido.';
  for (const key of ['requestDate', 'from', 'to'] as const) if (!isCalendarDate(draft[key])) errors[key] = 'Ingresa una fecha válida.';
  if (!errors.from && !errors.to && draft.to < draft.from) errors.to = 'Debe ser igual o posterior al inicio.';
  if (draft.totalDays.trim() && !/^(\d+([.,]\d)?|\d*\s?(½|1\/2))$/.test(draft.totalDays.trim())) errors.totalDays = 'Ingresa un número de días válido.';
  if (draft.type === 'por_hora') {
    if (!/^\d{1,2}$/.test(draft.hours.trim())) errors.hours = 'Ingresa las horas.';
    if (!/^\d{1,2}$/.test(draft.minutes.trim()) || Number(draft.minutes) > 59) errors.minutes = 'Ingresa minutos entre 0 y 59.';
    for (const key of ['startTime', 'endTime'] as const) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft[key])) errors[key] = 'Ingresa una hora válida.';
    if (!errors.startTime && !errors.endTime && draft.endTime <= draft.startTime) errors.endTime = 'Debe ser posterior a la hora de inicio.';
    if (!isCalendarDate(draft.recoveryDate)) errors.recoveryDate = 'Ingresa una fecha válida.';
  }
  return errors;
}
