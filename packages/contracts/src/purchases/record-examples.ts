import { createReviewDraft } from './extraction.js';
import { extractionExamples } from './examples.js';
import type { CreatePurchase, PurchaseListQuery, PurchaseListResponse } from './records.js';

// Fictitious values shared only for executable contract examples and tests.
export const manualPurchaseExample = {
  operationId: '00000000-0000-4000-8000-000000000125',
  ...createReviewDraft(extractionExamples[0].response),
} as CreatePurchase;

// A reviewed contract fixture, never the result of a real extraction.
export const reviewedContractPurchaseExample: CreatePurchase = {
  ...structuredClone(manualPurchaseExample),
  origin: { type: 'contract_example', exampleId: 'recovered' },
};

export const purchaseListQueryExample: PurchaseListQuery = {
  reviewStatus: 'pending', page: 1, pageSize: 20, q: 'demostracion',
  dateFrom: '2026-10-12', dateTo: '2026-10-12', unitCode: '270101', projectCode: '00000000',
};
export const purchaseListResponseExample: PurchaseListResponse = {
  data: [{ id: '00000000-0000-4000-8000-000000000126', requestNumber: '000125', sentDate: '2026-10-12', description: 'Insumos de demostración', totalAmount: '200000', documentType: null, reviewStatus: 'pending', version: 1, source: 'contract_example', exampleId: 'recovered' }],
  pagination: { page: 1, pageSize: 20, total: 1 }, totals: { currency: 'CLP', documentTotal: '200000' },
};
