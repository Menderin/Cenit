import { StandardFonts } from 'pdf-lib';
import { leaveTypes, type LeaveRequest } from '@cenit/contracts/personnel';
import { leaveCells, leaveSheet } from './leave-layout.js';
import { fillTemplate } from './template-pdf.js';

const templatePath = new URL('../../../../assets/leave-request-template.pdf', import.meta.url);
// Casillas de los tipos, en el orden de la hoja: columna izquierda y luego derecha.
const typeCells = ['D19', 'D21', 'D23', 'D25', 'D27', 'D29', 'D31', 'M19', 'M21', 'M23', 'M25', 'M27', 'M29', 'M31'] as const;
const left = new Set(['D8', 'D10', 'D33']);
const parts = (value: string, shortYear = false) => {
  if (!value) return ['', '', ''];
  const [year, month, day] = value.split('-');
  return [String(Number(day)), String(Number(month)), shortYear ? year!.slice(-2) : year!];
};

/** PDF carta de la solicitud: sólo datos del solicitante; firmas y sección de RRHH quedan en blanco. */
export function leavePdf(d: LeaveRequest) {
  const hourly = d.type === 'por_hora';
  const [day, month, year] = parts(d.requestDate, true), [fromDay, fromMonth, fromYear] = parts(d.from), [toDay, toMonth, toYear] = parts(d.to);
  const [recoveryDay, recoveryMonth, recoveryYear] = hourly ? parts(d.recoveryDate) : ['', '', ''];
  const entries: [string, string, string][] = [
    ['U5', 'requestDate', day!], ['V5', 'requestDate', month!], ['W5', 'requestDate', year!],
    ['D8', 'name', d.name], ['U8', 'rut', d.rut], ['D10', 'unit', d.unit],
    ['F12', 'from', fromDay!], ['G12', 'from', fromMonth!], ['H12', 'from', fromYear!],
    ['M12', 'to', toDay!], ['N12', 'to', toMonth!], ['P12', 'to', toYear!], ['V12', 'totalDays', d.totalDays],
    ['D15', 'hours', hourly ? d.hours : ''], ['F15', 'minutes', hourly ? d.minutes : ''],
    ['M14', 'startTime', hourly ? d.startTime : ''], ['V14', 'endTime', hourly ? d.endTime : ''],
    ['G17', 'recoveryDate', recoveryDay!], ['H17', 'recoveryDate', recoveryMonth!], ['I17', 'recoveryDate', recoveryYear!],
    ...typeCells.map((cell, index): [string, string, string] => [cell, 'type', d.type === leaveTypes[index] ? 'X' : '']),
    ['D33', 'notes', d.notes],
  ];
  return fillTemplate({ template: templatePath, sheet: leaveSheet, font: StandardFonts.Helvetica, cells: leaveCells, entries, left });
}
