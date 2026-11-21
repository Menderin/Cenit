import { leaveEntries, leaveForm, type LeaveRequest } from '@cenit/contracts';
import { OfficialForm } from '../../../shared/components/OfficialForm.js';
import template from './leave-template.svg';

// La plantilla conserva el formato y los rótulos de SOL. PERMISO, sin los datos del ejemplo. Firmas y sección de RRHH quedan en blanco.
export function LeaveDocument({ draft }: { draft: LeaveRequest }) {
  return <OfficialForm label="Documento de solicitud de permiso" template={template} layout={leaveForm} entries={leaveEntries(draft)}
    alt="Solicitud de permiso UCN: datos del funcionario, fechas, horario, tipo de permiso, observaciones, tres espacios de firma y sección de uso exclusivo de Recursos Humanos." />;
}
