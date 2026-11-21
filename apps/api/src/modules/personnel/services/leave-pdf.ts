import { leaveEntries, leaveForm, type LeaveRequest } from '@cenit/contracts/personnel';
import { fillForm } from '../../../infrastructure/forms.js';

const template = new URL('../../../../assets/leave-request-template.pdf', import.meta.url);

/** PDF carta de la solicitud: sólo datos del solicitante; firmas y sección de RRHH quedan en blanco. */
export const leavePdf = (d: LeaveRequest) => fillForm(template, leaveForm, leaveEntries(d));
