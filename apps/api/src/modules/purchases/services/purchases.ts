import { validateCreatePurchase, validatePurchaseListQuery, type CreatePurchase, type PurchaseListQuery } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';
import { PurchaseRepository } from '../repositories/purchases.js';

export class PurchaseService {
  constructor(private readonly repository: PurchaseRepository) {}
  create(input: CreatePurchase, accountId: string) {
    if (validateCreatePurchase(input).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los formatos y los cuatro campos obligatorios.');
    return this.repository.create(input, accountId);
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
