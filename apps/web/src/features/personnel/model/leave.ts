import { calendarDate, calendarValue } from '../../../shared/lib/dates.js';
import type { LeaveRequest, LeaveType } from '@cenit/contracts';

export type LeaveDraft = LeaveRequest;
export type LeaveStep = 'funcionario' | 'permiso' | 'revision';
export type Errors = Partial<Record<string, string>>;

export const emptyLeave = (): LeaveDraft => ({
  requestDate: calendarValue(new Date()), name: '', rut: '', unit: '', type: '',
  from: '', to: '', totalDays: '', hours: '', minutes: '', startTime: '', endTime: '', recoveryDate: '', notes: '',
});

export const leaveSteps: { key: LeaveStep; label: string; intro: string }[] = [
  { key: 'funcionario', label: 'Funcionario', intro: 'Datos de quien solicita el permiso.' },
  { key: 'permiso', label: 'Permiso', intro: 'Tipo, fechas y observaciones.' },
  { key: 'revision', label: 'Revisión', intro: 'Revisa los datos; al final podrás ver, descargar o imprimir el documento.' },
];

// Orden de los campos en pantalla: el foco va al primero con error.
export const leaveStepFields: Record<Exclude<LeaveStep, 'revision'>, string[]> = {
  funcionario: ['name', 'rut', 'unit', 'requestDate'],
  permiso: ['type', 'from', 'to', 'totalDays', 'hours', 'minutes', 'startTime', 'endTime', 'recoveryDate', 'notes'],
};

// Los 14 tipos del formulario, en el orden de sus dos columnas.
export const leaveTypeLabels: Record<LeaveType, string> = {
  dia_administrativo: 'Día administrativo', administrativo_todo_evento: 'Administrativo (a todo evento)', por_hora: 'Por hora',
  vacaciones_pendientes: 'Vacaciones pendientes', matrimonio: 'Matrimonio', comision_servicio: 'Comisión de servicio', teletrabajo: 'Teletrabajo',
  permiso_especial_sindicatos: 'Permiso especial (sindicatos)', cumpleanos: 'Cumpleaños', logro_sindical: 'Logro sindical (personal de seguridad)',
  nacimiento_hijo: 'Nacimiento de hijo', defuncion_familiar: 'Defunción familiar', sin_goce_sueldo: 'Sin goce de sueldo', vacaciones_progresivas: 'Vacaciones progresivas',
};

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

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

// Reglas provisionales (preguntas PER-02 y PER-03 pendientes); el servidor aplica las mismas.
export function validateLeaveStep(draft: LeaveDraft, step: LeaveStep): Errors {
  const errors: Errors = {};
  const required = (key: keyof LeaveDraft, message: string) => { if (!draft[key].trim()) errors[key] = message; };
  const date = (key: keyof LeaveDraft, empty: string, invalid: string) => {
    if (!draft[key]) errors[key] = empty; else if (!calendarDate(draft[key])) errors[key] = invalid;
  };
  if (step === 'funcionario') {
    required('name', 'Ingresa el nombre del funcionario.');
    if (!draft.rut.trim()) errors.rut = 'Ingresa el RUT.';
    else if (!validRut(draft.rut)) errors.rut = 'Revisa el RUT; el dígito verificador no coincide.';
    required('unit', 'Ingresa la unidad en que trabaja.');
    date('requestDate', 'Ingresa la fecha de la solicitud.', 'Revisa la fecha de la solicitud.');
  }
  if (step === 'permiso') {
    if (!draft.type) errors.type = 'Elige el tipo de permiso.';
    date('from', 'Ingresa la fecha de inicio.', 'Revisa la fecha de inicio.');
    date('to', 'Ingresa la fecha de término.', 'Revisa la fecha de término.');
    if (!errors.from && !errors.to && draft.to < draft.from) errors.to = 'Debe ser igual o posterior al inicio.';
    if (draft.totalDays.trim() && !/^(\d+([.,]\d)?|\d*\s?(½|1\/2))$/.test(draft.totalDays.trim())) errors.totalDays = 'Usa un número; para medio día escribe ½ o 0,5.';
    if (draft.type === 'por_hora') {
      if (!/^\d{1,2}$/.test(draft.hours.trim())) errors.hours = 'Ingresa las horas (0 a 99).';
      if (!/^\d{1,2}$/.test(draft.minutes.trim()) || Number(draft.minutes) > 59) errors.minutes = 'Ingresa minutos entre 0 y 59.';
      if (!time.test(draft.startTime)) errors.startTime = 'Ingresa la hora de inicio.';
      if (!time.test(draft.endTime)) errors.endTime = 'Ingresa la hora de término.';
      else if (!errors.startTime && draft.endTime <= draft.startTime) errors.endTime = 'Debe ser posterior a la hora de inicio.';
      date('recoveryDate', 'Ingresa la fecha de recuperación.', 'Revisa la fecha de recuperación.');
    }
  }
  // Límites del contrato del servidor, aplicados sin recortar la entrada.
  const limits: Partial<Record<keyof LeaveDraft, number>> = { name: 500, rut: 12, unit: 500, totalDays: 16, notes: 500 };
  for (const key of leaveStepFields[step as Exclude<LeaveStep, 'revision'>] ?? []) {
    const limit = limits[key as keyof LeaveDraft];
    if (limit && [...draft[key as keyof LeaveDraft]].length > limit) errors[key] = `Usa como máximo ${limit} caracteres.`;
  }
  return errors;
}

/** Datos que se envían al servidor: los del horario sólo cuando el permiso es por hora. */
export function leaveInput(draft: LeaveDraft): LeaveDraft {
  return draft.type === 'por_hora' ? draft : { ...draft, hours: '', minutes: '', startTime: '', endTime: '', recoveryDate: '' };
}

export function leaveFileName(draft: LeaveDraft) {
  const words = draft.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(-2).join('-');
  return ['solicitud-permiso', words, draft.from].filter(Boolean).join('-');
}

/** Fecha separada en día, mes y año, como en las casillas de la hoja. */
// Día, mes y año como los escribe el documento (contrato compartido con el PDF).
export { formDateParts as leaveDateParts } from '@cenit/contracts';
