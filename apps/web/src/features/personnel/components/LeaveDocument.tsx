import { leaveTypes } from '@cenit/contracts';
import { leaveDateParts, type LeaveDraft } from '../model/leave.js';
import { leaveCells, leaveSheet } from '../model/leave-layout.js';
import { TemplateDocument } from './TemplateDocument.js';
import template from './leave-template.svg';

const left = new Set(['D8', 'D10', 'D33']);
const typeCells = ['D19', 'D21', 'D23', 'D25', 'D27', 'D29', 'D31', 'M19', 'M21', 'M23', 'M25', 'M27', 'M29', 'M31'] as const;

// La plantilla conserva el formato y los rótulos de SOL. PERMISO, sin los datos del ejemplo.
// Firmas y sección de RRHH quedan en blanco.
export function LeaveDocument({ draft }: { draft: LeaveDraft }) {
  const hourly = draft.type === 'por_hora';
  const [day, month, year] = leaveDateParts(draft.requestDate, true);
  const [fromDay, fromMonth, fromYear] = leaveDateParts(draft.from), [toDay, toMonth, toYear] = leaveDateParts(draft.to);
  const [recoveryDay, recoveryMonth, recoveryYear] = hourly ? leaveDateParts(draft.recoveryDate) : ['', '', ''];
  const values: Record<string, string> = {
    U5: day, V5: month, W5: year, D8: draft.name, U8: draft.rut, D10: draft.unit,
    F12: fromDay, G12: fromMonth, H12: fromYear, M12: toDay, N12: toMonth, P12: toYear, V12: draft.totalDays,
    D15: hourly ? draft.hours : '', F15: hourly ? draft.minutes : '', M14: hourly ? draft.startTime : '', V14: hourly ? draft.endTime : '',
    G17: recoveryDay, H17: recoveryMonth, I17: recoveryYear, D33: draft.notes,
  };
  typeCells.forEach((cell, index) => { values[cell] = draft.type === leaveTypes[index] ? 'X' : ''; });
  return <TemplateDocument variant="leave" label="Documento de solicitud de permiso" template={template}
    alt="Solicitud de permiso UCN: datos del funcionario, fechas, horario, tipo de permiso, observaciones, tres espacios de firma y sección de uso exclusivo de Recursos Humanos."
    sheet={leaveSheet} cells={leaveCells} values={values} left={left} />;
}
