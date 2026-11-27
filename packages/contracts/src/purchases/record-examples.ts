import { createReviewDraft } from './extraction.js';
import { extractionExamples } from './examples.js';
import type { CreatePurchase, PurchaseListQuery, PurchaseListResponse } from './records.js';

// Valores ficticios, sólo para ejemplos ejecutables del contrato y pruebas.
const lines = createReviewDraft(extractionExamples[0].response).lines;
export const manualPurchaseExample: CreatePurchase = {
  operationId: '00000000-0000-4000-8000-000000000125',
  record: { recordDate: '2026-10-12', document: 'SISTEMA DE COMPRAS', requestNumber: '000125', provider: 'Proveedor Ficticio A', description: 'Insumos de demostración',
    totalAmount: '200000', documentType: 'COTIZACIÓN', bi: 'S/N', unitCode: '270101', projectCode: '00000000', accountingCode: '420405', rut: '76918240-3',
    area: 'FAMED', item: 'ALIMENTACIÓN', paymentSituation: 'PENDIENTE' },
  oracle: { sentDate: '2026-10-12', sentTime: '10:30:00', oracleId: 'demo-000325', sender: 'Solicitante Demo', recipient: 'Destinatario Demo', taxAmount: '0', attachmentReference: 'Anexo ficticio' },
  lines,
};

// Un ejemplo de contrato, nunca el resultado de una extracción real.
export const reviewedContractPurchaseExample: CreatePurchase = {
  ...structuredClone(manualPurchaseExample),
  origin: { type: 'contract_example', exampleId: 'recovered' },
};

export const purchaseListQueryExample: PurchaseListQuery = {
  page: 1, pageSize: 20, q: 'demostracion', dateFrom: '2026-10-12', dateTo: '2026-10-12', unitCode: '270101', projectCode: '00000000', paymentSituation: 'PENDIENTE',
};
export const purchaseListResponseExample: PurchaseListResponse = {
  data: [{ id: '00000000-0000-4000-8000-000000000126', recordDate: '2026-10-12', requestNumber: '000125', provider: 'Proveedor Ficticio A', description: 'Insumos de demostración',
    totalAmount: '200000', documentType: null, unitCode: '270101', paymentSituation: 'PENDIENTE', version: 1, source: 'contract_example', exampleId: 'recovered' }],
  pagination: { page: 1, pageSize: 20, total: 1 }, paymentCounts: { all: 1, pending: 1, paid: 0 }, totals: { currency: 'CLP', documentTotal: '200000' },
};
