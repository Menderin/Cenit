import { validateCreatePurchase, validatePurchaseListQuery, type CreatePurchase, type PurchaseListQuery } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';
import { PurchaseRepository } from '../repositories/purchases.js';
import type { CaptureReceipts } from './capture-receipts.js';

export class PurchaseService {
  constructor(private readonly repository: PurchaseRepository, private readonly receipts?: CaptureReceipts) {}
  create(input: CreatePurchase, accountId: string) {
    if (validateCreatePurchase(input).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los formatos y los cuatro campos obligatorios.');
    const origin = input.origin;
    if (origin?.type === 'image_capture') {
      if (!this.receipts) throw new ApiError(503, 'EXTRACTION_UNAVAILABLE', 'La verificación de captura no está disponible.');
      this.receipts.verify(origin, accountId, true);
    }
    return this.repository.create(input, accountId, () => {
      if (origin?.type === 'image_capture') this.receipts!.verify(origin, accountId);
    });
  }
  list(query: PurchaseListQuery) {
    if (validatePurchaseListQuery(query).length) throw new ApiError(400, 'INVALID_FILTER', 'Revisa las fechas y los filtros de búsqueda.');
    return this.repository.list(query);
  }
  async get(id: string) {
    const record = await this.repository.get(id);
    if (!record) throw new ApiError(404, 'NOT_FOUND', 'Solicitud inexistente.');
    return { data: record };
  }
  async validate(id: string, version: number, accountId: string) { return { data: await this.repository.validate(id, version, accountId) }; }
}
