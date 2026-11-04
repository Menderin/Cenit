import { validateCreatePurchase, validatePurchasePayload, validatePurchaseListQuery, type CreatePurchase, type PurchaseListQuery, type UpdatePurchase } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';
import { PurchaseRepository } from '../repositories/purchases.js';
import type { CaptureReceipts } from './capture-receipts.js';
import { defaultPurchaseCapabilities } from './config.js';
import type { PurchaseCapabilities } from '@cenit/contracts/purchases';
import { createPurchaseWorkbook } from './export.js';

export class PurchaseService {
  constructor(private readonly repository: PurchaseRepository, private readonly receipts?: CaptureReceipts, private readonly capabilities: PurchaseCapabilities = defaultPurchaseCapabilities) {}
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
  update(id: string, input: UpdatePurchase) {
    const { expectedVersion, ...payload } = input;
    if (validatePurchasePayload(payload).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los formatos y los cuatro campos obligatorios.');
    return this.repository.update(id, payload, expectedVersion);
  }
  list(query: PurchaseListQuery) {
    if (validatePurchaseListQuery(query).length) throw new ApiError(400, 'INVALID_FILTER', 'Revisa las fechas y los filtros de búsqueda.');
    return this.repository.list(query);
  }
  async export(query: PurchaseListQuery) {
    if (validatePurchaseListQuery(query).length) throw new ApiError(400, 'INVALID_FILTER', 'Revisa las fechas y los filtros de búsqueda.');
    const result = await this.repository.export(query);
    const workbook = await createPurchaseWorkbook(result.rows as Parameters<typeof createPurchaseWorkbook>[0], result.documentTotal);
    return workbook.xlsx.writeBuffer();
  }
  async get(id: string) {
    const record = await this.repository.get(id);
    if (!record) throw new ApiError(404, 'NOT_FOUND', 'Solicitud inexistente.');
    return { data: record };
  }
  async validate(id: string, version: number, accountId: string) {
    if (!this.capabilities.secondReviewEnabled) throw new ApiError(409, 'FEATURE_DISABLED', 'La segunda revisión no está habilitada en Cenit.');
    return { data: await this.repository.validate(id, version, accountId) };
  }
  summary() { return this.repository.summary(); }
  delete(id: string, version: number) { return this.repository.delete(id, version); }
}
