import { Value } from '@sinclair/typebox/value';
import type { TSchema, Static } from '@sinclair/typebox';
import { PurchaseResponseSchema, PurchaseListResponseSchema, PurchaseSummaryResponseSchema, PurchaseDeletionResponseSchema, validateExtractionResponse, type ExtractionResponse, type CreatePurchase, type PurchaseFilters } from '@cenit/contracts/purchases';
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
export const getPurchaseSummary = async (signal: AbortSignal) => read(PurchaseSummaryResponseSchema, await api('/purchases/summary', { signal }));
export const deletePurchase = async (id: string, expectedVersion: number) => read(PurchaseDeletionResponseSchema, await api(`/purchases/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }) }));
export const createPurchase = async (input: CreatePurchase) => read(PurchaseResponseSchema, await api('/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
export const validatePurchase = async (id: string, expectedVersion: number) => read(PurchaseResponseSchema, await api(`/purchases/${id}/validation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }) }));
export async function extractPurchase(file: File, signal: AbortSignal): Promise<ExtractionResponse> {
  const body = new FormData(); body.append('file', file);
  const response: unknown = await (await api('/purchases/extractions', { method: 'POST', body, signal })).json();
  if (validateExtractionResponse(response).length) throw new HttpError(0, 'El servidor devolvió candidatos con un formato inesperado.');
  const result = response as ExtractionResponse;
  if (!result.data.origin || !result.data.captureLayout) throw new HttpError(0, 'La respuesta no acredita el procesamiento de la captura.');
  return result;
}
