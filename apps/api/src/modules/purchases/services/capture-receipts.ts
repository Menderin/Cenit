import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CaptureOrigin } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';

export type CaptureMetadata = Omit<CaptureOrigin, 'receipt'>;
export class CaptureReceipts {
  constructor(private readonly key: Buffer, private readonly now = () => Date.now()) {
    if (key.length < 32) throw new Error('El secreto de captura necesita al menos 32 bytes.');
  }
  private signature(metadata: CaptureMetadata, accountId: string) {
    return createHmac('sha256', this.key).update(JSON.stringify([
      'cenit-capture-v1', accountId, metadata.extractionId, metadata.processorVersion, metadata.processedAt,
    ])).digest('base64url');
  }
  issue(metadata: CaptureMetadata, accountId: string): CaptureOrigin {
    return { ...metadata, receipt: this.signature(metadata, accountId) };
  }
  verify(origin: CaptureOrigin, accountId: string, existing = false) {
    const signature = Buffer.from(this.signature(origin, accountId));
    const supplied = Buffer.from(origin.receipt);
    const issued = Date.parse(origin.processedAt);
    if (signature.length !== supplied.length || !timingSafeEqual(signature, supplied) || !Number.isFinite(issued) || issued > this.now() ||
      (!existing && this.now() - issued >= 2 * 60 * 60 * 1000)) throw new ApiError(400, 'INVALID_CAPTURE_ORIGIN', 'La referencia de captura no es válida o venció. Vuelve a procesarla.');
  }
}
export function readCaptureReceipts() {
  return process.env.CAPTURE_RECEIPT_KEY_FILE ? new CaptureReceipts(readFileSync(process.env.CAPTURE_RECEIPT_KEY_FILE)) : undefined;
}
