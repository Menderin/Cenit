import { commissionEntries, commissionForm, type ServiceCommission } from '@cenit/contracts';
import { OfficialForm } from '../../../shared/components/OfficialForm.js';
import template from './commission-template.svg';

// La plantilla conserva únicamente el formato y los rótulos de COMISION; casillas y valores son los mismos del PDF.
export function CommissionDocument({ draft }: { draft: ServiceCommission }) {
  return <OfficialForm label="Documento de comisión de servicios" template={template} layout={commissionForm} entries={commissionEntries(draft)}
    alt="Comisión de servicios UCN: datos generales, datos del evento, descripción y tres espacios de autorización." />;
}
