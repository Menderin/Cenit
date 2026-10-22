import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { ExtractionResponseSchema, validateExtractionResponse, type ExtractionResponse } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';
import type { CaptureReceipts } from './capture-receipts.js';

export type ExtractionProcessor = (image: Buffer, name: string, mime: string, signal: AbortSignal) => Promise<unknown>;
export function httpExtractionProcessor(url: string): ExtractionProcessor {
  const endpoint = new URL('/extract', url);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('URL de OCR inválida.');
  return async (image, name, mime, signal) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': mime, 'X-File-Name': encodeURIComponent(name) }, body: new Uint8Array(image), signal });
    if (!response.body) throw new Error('Respuesta OCR vacía.');
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2*1024*1024) throw new Error('Respuesta OCR demasiado grande.');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok) {
      const known = body as { code?: string };
      const codes: Record<string, number> = { INVALID_IMAGE: 422, IMAGE_DIMENSIONS_EXCEEDED: 422, EXTRACTION_NO_DATA: 422, UNSUPPORTED_CAPTURE_LAYOUT: 422, UNSUPPORTED_MEDIA_TYPE: 415, PAYLOAD_TOO_LARGE: 413, EXTRACTION_UNAVAILABLE: 503 };
      if (known && typeof known.code === 'string' && codes[known.code]) throw new ApiError(codes[known.code]!, known.code,
        known.code === 'EXTRACTION_UNAVAILABLE' ? 'El procesador está ocupado o no está disponible. Reintenta en unos instantes.'
          : known.code === 'UNSUPPORTED_CAPTURE_LAYOUT' ? 'La imagen no tiene el formato esperado. Sube una captura de la solicitud de compra.' : 'No fue posible procesar la captura. Revisa el archivo o reintenta.');
      throw new Error('Respuesta OCR inválida.');
    }
    return body;
  };
}
export class ExtractionService {
  private active = false;
  constructor(private readonly processor?: ExtractionProcessor, private readonly receipts?: CaptureReceipts, private readonly timeoutMs = 60_000) {}
  async extract(image: Buffer, name: string, mime: string, accountId: string, signal: AbortSignal): Promise<ExtractionResponse> {
    if (!this.processor || !this.receipts || this.active) throw new ApiError(503, 'EXTRACTION_UNAVAILABLE', 'El procesador no está disponible. Inténtalo más tarde.');
    this.active = true;
    try {
      const data = await this.processor(image, name, mime, AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]));
      if (!Value.Check(ExtractionResponseSchema, data) || validateExtractionResponse(data).length || !data.data.captureLayout || data.data.origin ||
        data.data.input.bytes !== image.length || data.data.input.name !== name || data.data.input.mimeType !== mime) throw new Error('Salida OCR inválida.');
      data.data.extractionId = randomUUID();
      data.data.origin = this.receipts.issue({ type: 'image_capture', extractionId: data.data.extractionId, processorVersion: data.data.regions ? 'ppocr5-latin-grid8-layout-v4' : 'ppocr5-latin-grid8-layout-v3', processedAt: new Date().toISOString() }, accountId);
      if (validateExtractionResponse(data).length) throw new Error('Salida OCR inválida.');
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'EXTRACTION_UNAVAILABLE', 'No se pudo completar la extracción. Inténtalo nuevamente.');
    } finally { this.active = false; }
  }
}
