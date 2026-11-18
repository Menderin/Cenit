import type {
  AssetDetail, AssetListQuery, AssetListResponse, AssetLocation, AssetSummary, CreateAsset, CreateDelivery, CreateLoan, Delivery, DeliveryListResponse,
  DocumentListQuery, Loan, LoanListResponse, PeopleQuery, Person, PersonInput, ReturnLoan, UpdateAsset,
} from '@cenit/contracts/assets';
import { api, HttpError } from '../../../shared/lib/http.js';

const base = '/assets';
const json = async <T>(response: Response) => (await response.json() as { data: T }).data;
const query = (values: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
};
const send = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const assetKeys = { all: ['assets'] as const };
export const getAssetSummary = async (signal?: AbortSignal) => json<AssetSummary>(await api(`${base}/summary`, { signal }));
export const listAssets = async (filters: Partial<AssetListQuery>, signal?: AbortSignal) => await (await api(`${base}${query(filters)}`, { signal })).json() as AssetListResponse;
export const getAsset = async (id: string, signal?: AbortSignal) => json<AssetDetail>(await api(`${base}/${id}`, { signal }));
export const createAsset = async (input: CreateAsset) => json<AssetDetail>(await api(base, send('POST', input)));
export const updateAsset = async (id: string, input: UpdateAsset) => json<AssetDetail>(await api(`${base}/${id}`, send('PUT', input)));
export const relocateAsset = async (id: string, input: AssetLocation) => json<AssetDetail>(await api(`${base}/${id}/location`, send('POST', input)));

export const listPeople = async (filters: PeopleQuery, signal?: AbortSignal) => json<Person[]>(await api(`${base}/people${query(filters)}`, { signal }));
export const createPerson = async (input: PersonInput) => json<Person>(await api(`${base}/people`, send('POST', input)));
export const setPersonStatus = async (id: string, active: boolean) => json<Person>(await api(`${base}/people/${id}/status`, send('POST', { active })));

export const listDeliveries = async (filters: Partial<DocumentListQuery>, signal?: AbortSignal) => await (await api(`${base}/deliveries${query(filters)}`, { signal })).json() as DeliveryListResponse;
export const getDelivery = async (id: string, signal?: AbortSignal) => json<Delivery>(await api(`${base}/deliveries/${id}`, { signal }));
export const createDelivery = async (input: CreateDelivery) => json<Delivery>(await api(`${base}/deliveries`, send('POST', input)));

export const listLoans = async (filters: Partial<DocumentListQuery>, signal?: AbortSignal) => await (await api(`${base}/loans${query(filters)}`, { signal })).json() as LoanListResponse;
export const getLoan = async (id: string, signal?: AbortSignal) => json<Loan>(await api(`${base}/loans/${id}`, { signal }));
export const createLoan = async (input: CreateLoan) => json<Loan>(await api(`${base}/loans`, send('POST', input)));
export const returnLoan = async (id: string, input: ReturnLoan) => json<Loan>(await api(`${base}/loans/${id}/return`, send('POST', input)));

export const documentPath = {
  alta: (id: string) => `${base}/${id}/alta.pdf`, delivery: (id: string) => `${base}/deliveries/${id}/pdf`, loan: (id: string) => `${base}/loans/${id}/pdf`,
};
/** Descarga un PDF generado por el servidor; exige un PDF válido antes de iniciar la descarga. */
export async function downloadPdf(path: string, fileName: string) {
  const response = await api(path);
  const blob = await response.blob();
  if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/pdf' || await blob.slice(0, 5).text() !== '%PDF-') throw new HttpError(0, 'El servidor no devolvió un PDF válido.');
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${fileName}.pdf`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
