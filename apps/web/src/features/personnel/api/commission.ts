import type { ServiceCommission } from '@cenit/contracts';
import { requestPersonnelPdf } from './pdf.js';

export function requestCommissionPdf(draft: ServiceCommission, signal: AbortSignal): Promise<Blob> {
  const input = {
    ...draft,
    categoryOther: draft.category === 'otro' ? draft.categoryOther : '',
    ...(draft.activity === 'evento' ? { description: '' } : { eventName: '', eventOrganizer: '', eventWork: '', eventProject: '', eventNotes: '' }),
  };
  return requestPersonnelPdf('/personnel/service-commissions/pdf', input, signal);
}
