import { leaveInput, type LeaveDraft } from '../model/leave.js';
import { requestPersonnelPdf } from './pdf.js';

export function requestLeavePdf(draft: LeaveDraft, signal: AbortSignal): Promise<Blob> {
  return requestPersonnelPdf('/personnel/leave-requests/pdf', leaveInput(draft), signal);
}
