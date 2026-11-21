import { Value } from '@sinclair/typebox/value';
import type { TSchema, Static } from '@sinclair/typebox';
import { PurchaseResponseSchema, PurchaseListResponseSchema, PurchaseSummaryResponseSchema, PurchaseProjectsResponseSchema, PurchaseProjectSummaryResponseSchema, PurchaseDeletionResponseSchema, PurchaseCapabilitiesResponseSchema, PurchaseSheetsResponseSchema, validateExtractionResponse, type ExtractionResponse, type CreatePurchase, type PurchaseFilters, type PurchaseListQuery, type UpdatePurchase } from '@cenit/contracts/purchases';
import { api, HttpError } from '../../../shared/lib/http.js';

async function read<T extends TSchema>(schema: T, response: Response): Promise<Static<T>> {
  const body: unknown = await response.json();
  if (!Value.Check(schema, body)) throw new HttpError(0, 'El servidor devolvió datos con un formato inesperado.');
  return body as Static<T>;
}
export const listPurchases = async (state: 'pending' | 'reviewed' | 'all', page: number, signal: AbortSignal, filters: PurchaseFilters = {}, view: Pick<PurchaseListQuery, 'sort' | 'pageSize'> = { pageSize: 20 }) => {
  const query = new URLSearchParams({ reviewStatus: state, page: String(page), pageSize: String(view.pageSize), ...(view.sort ? { sort: view.sort } : {}), ...filters });
  return read(PurchaseListResponseSchema, await api(`/purchases?${query}`, { signal }));
};
export const downloadPurchaseExport = async (filters: PurchaseFilters, view: Pick<PurchaseListQuery, 'sort'>, signal: AbortSignal) => {
  const query = new URLSearchParams({ reviewStatus: 'all', page: '1', pageSize: '100', ...(view.sort ? { sort: view.sort } : {}), ...filters });
  const response = await api(`/purchases/export.xlsx?${query}`, { signal });
  const blob = await response.blob();
  signal.throwIfAborted();
  if (blob.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new HttpError(0, 'El servidor no devolvió un archivo Excel válido.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'compras.xlsx';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
export const getPurchaseCapabilities = async (signal: AbortSignal) => read(PurchaseCapabilitiesResponseSchema, await api('/purchases/capabilities', { signal }));
export const getPurchaseSheetsStatus = async (signal: AbortSignal, purchaseId?: string) => read(PurchaseSheetsResponseSchema, await api(`/purchases/sheets-sync${purchaseId ? `?purchaseId=${encodeURIComponent(purchaseId)}` : ''}`, { signal }));
export const getPurchase = async (id: string, signal: AbortSignal) => read(PurchaseResponseSchema, await api(`/purchases/${id}`, { signal }));
// Sin año se pide el resumen del año en curso; así Inicio usa la misma ruta que antes al abrir.
export const getPurchaseSummary = async (signal: AbortSignal, year?: string) => read(PurchaseSummaryResponseSchema, await api(`/purchases/summary${year ? `?year=${year}` : ''}`, { signal }));
export const listPurchaseProjects = async (signal: AbortSignal, year?: string) => read(PurchaseProjectsResponseSchema, await api(`/purchases/projects${year ? `?year=${year}` : ''}`, { signal }));
export const getPurchaseProject = async (code: string, signal: AbortSignal, year?: string) => read(PurchaseProjectSummaryResponseSchema, await api(`/purchases/projects/${encodeURIComponent(code)}${year ? `?year=${year}` : ''}`, { signal }));
export const deletePurchase = async (id: string, expectedVersion: number) => read(PurchaseDeletionResponseSchema, await api(`/purchases/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }) }));
export const createPurchase = async (input: CreatePurchase) => read(PurchaseResponseSchema, await api('/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
export const updatePurchase = async (id: string, input: UpdatePurchase) => read(PurchaseResponseSchema, await api(`/purchases/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
export const validatePurchase = async (id: string, expectedVersion: number) => read(PurchaseResponseSchema, await api(`/purchases/${id}/validation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }) }));
export async function extractPurchase(file: File, signal: AbortSignal): Promise<ExtractionResponse> {
  const body = new FormData(); body.append('file', file);
  const response: unknown = await (await api('/purchases/extractions', { method: 'POST', body, signal })).json();
  if (validateExtractionResponse(response).length) throw new HttpError(0, 'El servidor devolvió candidatos con un formato inesperado.');
  const result = response as ExtractionResponse;
  if (!result.data.origin || !result.data.captureLayout) throw new HttpError(0, 'La respuesta no acredita el procesamiento de la captura.');
  return result;
}
