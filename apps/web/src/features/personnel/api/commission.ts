import type { ServiceCommission } from '@cenit/contracts';
import { api, HttpError } from '../../../shared/lib/http.js';

export async function requestCommissionPdf(draft: ServiceCommission, signal: AbortSignal): Promise<Blob> {
  const input = {
    ...draft,
    categoryOther: draft.category === 'otro' ? draft.categoryOther : '',
    ...(draft.activity === 'evento' ? { description: '' } : { eventName: '', eventOrganizer: '', eventWork: '', eventProject: '', eventNotes: '' }),
  };
  const response = await api('/personnel/service-commissions/pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  const blob = await response.blob();
  signal.throwIfAborted();
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/pdf' || await blob.slice(0, 5).text() !== '%PDF-') {
    throw new HttpError(0, 'El servidor no devolvió un PDF válido.');
  }
  signal.throwIfAborted();
  return blob;
}
