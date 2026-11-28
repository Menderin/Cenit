import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { CreatePurchaseSchema, PurchaseListResponseSchema, PurchasePaymentSchema, requiredRecordFields, validateCreatePurchase, validatePurchaseListQuery } from './records.js';
import { manualPurchaseExample, reviewedContractPurchaseExample, purchaseListQueryExample, purchaseListResponseExample } from './record-examples.js';

describe('contrato del registro de gastos', () => {
  it('valida filtros combinados y fechas inclusivas sin convertir códigos en números', () => {
    expect(validatePurchaseListQuery(purchaseListQueryExample)).toEqual([]);
    expect(Value.Check(PurchaseListResponseSchema, purchaseListResponseExample)).toBe(true);
    expect(validatePurchaseListQuery({ page: 1, pageSize: 20, q: 'Clínica_%', unitCode: '00001', projectCode: '00.02', accountingCode: '420405', dateFrom: '2024-02-29', dateTo: '2024-02-29', sort: 'dateAsc' })).toEqual([]);
    expect(validatePurchaseListQuery({ page: 1, pageSize: 20, dateFrom: '0001-01-01', paymentSituation: 'PAGADO' })).toEqual([]);
  });
  it.each([{ q: '' }, { q: '   ' }, { q: 'x'.repeat(101) }, { unitCode: '' }, { projectCode: 'x'.repeat(256) }, { unitCode: 123 }, { dateFrom: '2026-02-29' }, { dateFrom: '0000-01-01' },
    { dateFrom: '2026-10-14', dateTo: '2026-10-13' }, { reviewStatus: 'pending' }, { sort: 'sentDateDesc' }, { paymentSituation: '' }])('rechaza filtros inválidos %j', filters => {
    expect(validatePurchaseListQuery({ page: 1, pageSize: 20, ...filters }).length).toBeGreaterThan(0);
  });
  it('el agregado acepta cadenas exactas mayores que el límite de un documento', () => {
    const response = { data: [], pagination: { page: 1, pageSize: 20, total: 0 }, totals: { currency: 'CLP', documentTotal: '1' + '0'.repeat(255) } };
    expect(Value.Check(PurchaseListResponseSchema, response)).toBe(true);
    expect(Value.Check(PurchaseListResponseSchema, { ...response, totals: { currency: 'CLP', documentTotal: 1000 } })).toBe(false);
  });
  it('admite procedencia omitida/manual y los tres ejemplos, sin combinaciones inventadas', () => {
    expect(validateCreatePurchase(reviewedContractPurchaseExample)).toEqual([]);
    for (const origin of [undefined, { type: 'manual' }, ...['recovered', 'partial', 'ambiguous'].map(exampleId => ({ type: 'contract_example', exampleId }))]) {
      expect(validateCreatePurchase({ ...manualPurchaseExample, ...(origin ? { origin } : {}) })).toEqual([]);
    }
    for (const origin of [{ type: 'manual', exampleId: 'recovered' }, { type: 'contract_example' }, { type: 'contract_example', exampleId: 'failure' }, { type: 'ocr' }]) {
      expect(validateCreatePurchase({ ...manualPurchaseExample, origin }).length).toBeGreaterThan(0);
    }
  });
  it('admite la fila mínima: sin líneas de Oracle ni datos opcionales', () => {
    const input = structuredClone(manualPurchaseExample); input.lines = [];
    for (const key of Object.keys(input.record)) if (!(requiredRecordFields as readonly string[]).includes(key)) Object.assign(input.record, { [key]: null });
    for (const key of Object.keys(input.oracle)) Object.assign(input.oracle, { [key]: null });
    expect(validateCreatePurchase(input)).toEqual([]);
  });
  it.each(requiredRecordFields)('exige %s y rechaza propiedades de servidor', key => {
    const input = structuredClone(manualPurchaseExample); Object.assign(input.record, { [key]: null });
    expect(Value.Check(CreatePurchaseSchema, input)).toBe(false);
    expect(validateCreatePurchase({ ...manualPurchaseExample, version: 2 }).length).toBeGreaterThan(0);
  });
  it('acepta RUT normalizado aunque su verificador no cuadre, y rechaza otros formatos', () => {
    const input = structuredClone(manualPurchaseExample);
    for (const rut of ['76918240-3', '1-9', '12345678-0', '9999999-K']) { input.record.rut = rut; expect(validateCreatePurchase(input)).toEqual([]); }
    for (const rut of ['76.918.240-3', '769182403', '76918240-k', '0-1']) { input.record.rut = rut; expect(validateCreatePurchase(input)[0]?.message).toMatch(/RUT/); }
  });
  it('rechaza fechas inexistentes y límites; conserva montos exactos de 255 dígitos', () => {
    const input = structuredClone(manualPurchaseExample);
    input.record.recordDate = '2026-02-30'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.record.recordDate = '0000-01-01'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.record.recordDate = '2026-10-13'; input.oracle.sentDate = '2026-02-30'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.oracle.sentDate = null; input.record.totalAmount = '9'.repeat(255); expect(validateCreatePurchase(input)).toEqual([]);
    input.record.totalAmount = '9'.repeat(256); expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.record.totalAmount = '6.5'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.record.totalAmount = '0'; input.lines = Array.from({ length: 101 }, () => structuredClone(manualPurchaseExample.lines[0]!));
    expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
  });
  it('el cambio de situación de pago exige versión y un texto', () => {
    expect(Value.Check(PurchasePaymentSchema, { expectedVersion: 3, paymentSituation: 'PAGADO' })).toBe(true);
    expect(Value.Check(PurchasePaymentSchema, { expectedVersion: 0, paymentSituation: 'PAGADO' })).toBe(false);
    expect(Value.Check(PurchasePaymentSchema, { expectedVersion: 1, paymentSituation: ' ' })).toBe(false);
  });
});
