import { Value } from '@sinclair/typebox/value';
import type { TSchema, Static } from '@sinclair/typebox';
import { PurchaseResponseSchema, PurchaseListResponseSchema, type CreatePurchase, type PurchaseFilters } from '@cenit/contracts/purchases';
import { api, HttpError } from '../../../shared/lib/http.js';

async function read<T extends TSchema>(schema: T, response: Response): Promise<Static<T>> {
  const body: unknown = await response.json();
  if (!Value.Check(schema, body)) throw new HttpError(0, 'El servidor devolvió datos con un formato inesperado.');
  return body as Static<T>;
}
export const listPurchases = async (state: 'pending' | 'reviewed', page: number, signal: AbortSignal, filters: PurchaseFilters = {}) => {
  const query = new URLSearchParams({ reviewStatus: state, page: String(page), pageSize: '20', ...filters });
  return read(PurchaseListResponseSchema, await api(`/purchases?${query}`, { signal }));
};
export const getPurchase = async (id: string, signal: AbortSignal) => read(PurchaseResponseSchema, await api(`/purchases/${id}`, { signal }));
export const createPurchase = async (input: CreatePurchase) => read(PurchaseResponseSchema, await api('/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
export const validatePurchase = async (id: string, expectedVersion: number) => read(PurchaseResponseSchema, await api(`/purchases/${id}/validation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }) }));
