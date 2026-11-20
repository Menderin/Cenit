import { api, HttpError } from '../../../shared/lib/http.js';

/** Envía un documento de Personal al servidor y exige un PDF como respuesta. */
export async function requestPersonnelPdf(path: string, input: object, signal: AbortSignal): Promise<Blob> {
  const response = await api(path, {
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
