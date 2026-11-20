import { formCells, formDateParts, styleCells, type FormEntry, type FormLayout } from '../common/forms.js';
import { leaveTypes, type LeaveRequest, type ServiceCommission } from './index.js';

// Comisión de servicios: hoja COMISION del XLSM recibido (910 × 1278). La plantilla conserva sólo formato y rótulos;
// los datos del ejemplo, fórmulas, macros y nombres de firmantes quedan fuera.
const commissionBoxes = {
  E11: [278, 200, 619, 25], E13: [278, 232, 619, 25], E15: [278, 266, 619, 26], F17: [304, 301, 129, 26], M17: [485, 301, 151, 26], U17: [711, 301, 134, 26],
  E19: [278, 346, 26, 20], K19: [433, 346, 26, 20], E21: [278, 371, 26, 21], R21: [636, 371, 26, 21], V21: [739, 371, 140, 21],
  E23: [278, 407, 26, 21], M23: [485, 407, 26, 21], R23: [636, 407, 26, 21], E25: [278, 449, 26, 21], E27: [278, 478, 26, 22],
  P25: [594, 449, 303, 21], P27: [594, 478, 303, 22], G29: [329, 521, 130, 21], P29: [594, 521, 117, 21],
  I31: [394, 563, 39, 21], O31: [568, 563, 53, 21], Y31: [816, 563, 63, 21], F33: [304, 605, 358, 21], T33: [684, 605, 55, 21],
  E35: [278, 647, 51, 21], H35: [351, 647, 67, 21], K35: [433, 647, 188, 21], R35: [636, 647, 209, 21], AA35: [857, 647, 40, 21],
  E37: [278, 677, 51, 21], H37: [351, 677, 67, 21], K37: [433, 677, 188, 21], R37: [636, 677, 209, 21], AA37: [857, 677, 40, 21],
  E41: [278, 747, 619, 24], E43: [278, 783, 619, 23], E45: [278, 820, 619, 79], E47: [278, 913, 619, 24], E49: [278, 958, 619, 21],
  B54: [11, 1023, 886, 103],
} as const;
export const commissionForm: FormLayout<keyof typeof commissionBoxes> = {
  sheet: { width: 910, height: 1278 }, placement: 'fit',
  style: { align: 'center', valign: 'middle', font: 'serif', size: 13.3333, upper: true },
  cells: formCells(commissionBoxes, {
    ...styleCells(['E11', 'E13', 'E15', 'E41', 'E43', 'E45', 'E47', 'E49', 'B54'], { align: 'left' }),
    ...styleCells(['G29', 'P29'], { upper: false }),
  }),
};

/** Fecha como la escribe la hoja: 23/sept/26. Una fecha incompleta se muestra tal cual. */
export function commissionDate(value: string) {
  const [day, month, year] = formDateParts(value, true);
  if (!day) return value;
  return `${day}/${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'][Number(month) - 1]}/${year}`;
}
/** Viático con separador de miles y dos decimales: 27.000,00. */
export function commissionAllowance(value: string) {
  if (!value.trim()) return '';
  const [integer, decimals = ''] = value.trim().split(',');
  return `${integer!.replaceAll('.', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals.padEnd(2, '0')}`;
}

/** Valores de la comisión en sus casillas. Sólo se imprime la actividad elegida (evento o descripción). */
export function commissionEntries(d: ServiceCommission): FormEntry<keyof typeof commissionBoxes>[] {
  const mark = (selected: boolean) => selected ? 'X' : '', event = d.activity === 'evento';
  const entries: FormEntry<keyof typeof commissionBoxes>[] = [
    ['E11', 'name', d.name], ['E13', 'position', d.position], ['E15', 'unit', d.unit],
    ['F17', 'group', mark(d.group === 'I')], ['M17', 'group', mark(d.group === 'II')], ['U17', 'group', mark(d.group === 'III')],
    ['E19', 'category', mark(d.category === 'academico')], ['K19', 'category', mark(d.category === 'no_academico')],
    ['E21', 'category', mark(d.category === 'directivo')], ['R21', 'category', mark(d.category === 'otro')], ['V21', 'categoryOther', d.category === 'otro' ? d.categoryOther : ''],
    ['E23', 'plant', mark(d.plant === 'oficial')], ['M23', 'plant', mark(d.plant === 'especial')], ['R23', 'plant', mark(d.plant === 'temporal')],
    ['E25', 'territory', mark(d.territory === 'nacional')], ['E27', 'territory', mark(d.territory === 'extranjero')],
    ['P25', 'place', d.territory === 'nacional' ? d.place : ''], ['P27', 'place', d.territory === 'extranjero' ? d.place : ''],
    ['G29', 'from', commissionDate(d.from)], ['P29', 'to', commissionDate(d.to)],
    ['I31', 'daysWithStay', d.daysWithStay], ['O31', 'daysWithoutStay', d.daysWithoutStay], ['Y31', 'totalDays', d.totalDays],
    ['F33', 'allowance', commissionAllowance(d.allowance)], ['T33', 'currency', d.allowance.trim() ? d.currency : ''],
    ['E41', 'eventName', event ? d.eventName : ''], ['E43', 'eventOrganizer', event ? d.eventOrganizer : ''], ['E45', 'eventWork', event ? d.eventWork : ''],
    ['E47', 'eventProject', event ? d.eventProject : ''], ['E49', 'eventNotes', event ? d.eventNotes : ''], ['B54', 'description', event ? '' : d.description],
  ];
  const rows = [['E35', 'H35', 'K35', 'R35', 'AA35'], ['E37', 'H37', 'K37', 'R37', 'AA37']] as const;
  const keys = ['institution', 'organization', 'unit', 'project', 'percent'] as const;
  d.funding.forEach((row, index) => keys.forEach((key, i) => {
    entries.push([rows[index]![i]!, `funding.${index}.${key}`, key === 'percent' && row[key] ? `${row[key]}%` : row[key]]);
  }));
  return entries;
}

// Solicitud de permiso: hoja SOL. PERMISO del XLSX recibido (858 × 1005), sin los datos del ejemplo.
// Firmas y sección de Recursos Humanos quedan en blanco.
const leaveBoxes = {
  U5: [698, 41, 37, 22], V5: [735, 41, 47, 22], W5: [782, 41, 45, 22], D8: [183, 84, 432, 22], U8: [698, 84, 129, 22], D10: [183, 116, 644, 23],
  F12: [243, 147, 34, 23], G12: [277, 147, 46, 23], H12: [323, 147, 55, 23], M12: [496, 147, 30, 23], N12: [526, 147, 37, 23], P12: [563, 147, 52, 23], V12: [735, 147, 47, 23],
  D15: [183, 199, 60, 22], F15: [243, 199, 80, 22], M14: [496, 178, 67, 21], V14: [735, 178, 67, 21],
  G17: [277, 229, 46, 22], H17: [323, 229, 30, 22], I17: [353, 229, 65, 22],
  D19: [183, 259, 37, 21], D21: [183, 288, 37, 22], D23: [183, 317, 37, 22], D25: [183, 346, 37, 20], D27: [183, 375, 37, 20], D29: [183, 404, 37, 20], D31: [183, 433, 37, 20],
  M19: [496, 259, 45, 21], M21: [496, 288, 45, 22], M23: [496, 317, 45, 22], M25: [496, 346, 45, 20], M27: [496, 375, 45, 20], M29: [496, 404, 45, 20], M31: [496, 433, 45, 20],
  D33: [183, 462, 660, 32],
} as const;
export const leaveForm: FormLayout<keyof typeof leaveBoxes> = {
  sheet: { width: 858, height: 1005 }, placement: 'fit',
  style: { align: 'center', valign: 'middle', font: 'sans', size: 13.3333, upper: true },
  cells: formCells(leaveBoxes, styleCells(['D8', 'D10', 'D33'], { align: 'left' })),
};
// Casillas de los tipos, en el orden de la hoja: columna izquierda y luego derecha.
const leaveTypeCells = ['D19', 'D21', 'D23', 'D25', 'D27', 'D29', 'D31', 'M19', 'M21', 'M23', 'M25', 'M27', 'M29', 'M31'] as const;

/** Valores de la solicitud: sólo datos del solicitante. El horario y la recuperación se imprimen sólo en el permiso por hora. */
export function leaveEntries(d: LeaveRequest): FormEntry<keyof typeof leaveBoxes>[] {
  const hourly = d.type === 'por_hora';
  const [day, month, year] = formDateParts(d.requestDate, true), [fromDay, fromMonth, fromYear] = formDateParts(d.from), [toDay, toMonth, toYear] = formDateParts(d.to);
  const [recoveryDay, recoveryMonth, recoveryYear] = hourly ? formDateParts(d.recoveryDate) : ['', '', ''];
  return [
    ['U5', 'requestDate', day], ['V5', 'requestDate', month], ['W5', 'requestDate', year],
    ['D8', 'name', d.name], ['U8', 'rut', d.rut], ['D10', 'unit', d.unit],
    ['F12', 'from', fromDay], ['G12', 'from', fromMonth], ['H12', 'from', fromYear],
    ['M12', 'to', toDay], ['N12', 'to', toMonth], ['P12', 'to', toYear], ['V12', 'totalDays', d.totalDays],
    ['D15', 'hours', hourly ? d.hours : ''], ['F15', 'minutes', hourly ? d.minutes : ''],
    ['M14', 'startTime', hourly ? d.startTime : ''], ['V14', 'endTime', hourly ? d.endTime : ''],
    ['G17', 'recoveryDate', recoveryDay], ['H17', 'recoveryDate', recoveryMonth], ['I17', 'recoveryDate', recoveryYear],
    ...leaveTypeCells.map((cell, index): FormEntry<keyof typeof leaveBoxes> => [cell, 'type', d.type === leaveTypes[index] ? 'X' : '']),
    ['D33', 'notes', d.notes],
  ];
}
