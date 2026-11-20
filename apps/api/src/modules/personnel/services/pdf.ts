import { commissionEntries, commissionForm, type ServiceCommission } from '@cenit/contracts/personnel';
import { fillForm } from '../../../infrastructure/forms.js';

const template = new URL('../../../../assets/service-commission-template.pdf', import.meta.url);

/** PDF carta de la comisión sobre la copia de la hoja COMISION; firmas vacías. */
export const commissionPdf = (d: ServiceCommission) => fillForm(template, commissionForm, commissionEntries(d));
