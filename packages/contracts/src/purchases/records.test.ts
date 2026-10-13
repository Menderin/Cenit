import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { CreatePurchaseSchema, PurchaseListResponseSchema, validateCreatePurchase, validatePurchaseListQuery } from './records.js';
import { manualPurchaseExample, reviewedContractPurchaseExample, purchaseListQueryExample, purchaseListResponseExample } from './record-examples.js';

describe('contrato de persistencia manual', () => {
  it('valida filtros combinados y fechas inclusivas sin convertir códigos en números', () => {
    expect(validatePurchaseListQuery(purchaseListQueryExample)).toEqual([]);
    expect(Value.Check(PurchaseListResponseSchema, purchaseListResponseExample)).toBe(true);
    expect(validatePurchaseListQuery({ reviewStatus: 'pending', page: 1, pageSize: 20, q: 'Clínica_%', unitCode: '00001', projectCode: '00.02', dateFrom: '2024-02-29', dateTo: '2024-02-29' })).toEqual([]);
    expect(validatePurchaseListQuery({ reviewStatus: 'reviewed', page: 1, pageSize: 20, dateFrom: '0001-01-01' })).toEqual([]);
  });
  it.each([{ q: '' }, { q: '   ' }, { q: 'x'.repeat(101) }, { unitCode: '' }, { projectCode: 'x'.repeat(256) }, { unitCode: 123 }, { dateFrom: '2026-02-29' }, { dateFrom: '0000-01-01' }, { dateFrom: '2026-10-14', dateTo: '2026-10-13' }, { unknown: true }])('rechaza filtros inválidos %j', filters => {
    expect(validatePurchaseListQuery({ reviewStatus: 'pending', page: 1, pageSize: 20, ...filters }).length).toBeGreaterThan(0);
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
    for (const origin of [{ type: 'manual', exampleId: 'recovered' }, { type: 'contract_example' }, { type: 'contract_example', exampleId: 'failure' }, { type: 'ocr' }, { type: 'contract_example', exampleId: null }]) {
      expect(validateCreatePurchase({ ...manualPurchaseExample, origin }).length).toBeGreaterThan(0);
    }
  });
  it('acepta ejemplo con varios proveedores, códigos textuales e impuesto cero', () => {
    expect(validateCreatePurchase(manualPurchaseExample)).toEqual([]);
    expect(manualPurchaseExample.lines).toHaveLength(2);
    expect(manualPurchaseExample.header.requestNumber).toBe('000125');
    expect(manualPurchaseExample.header.taxAmount).toBe('0');
  });
  it('admite mínimos sin ítems, sin deducir campos opcionales', () => {
    const input = structuredClone(manualPurchaseExample); input.lines = [];
    for (const key of Object.keys(input.header)) if (!['requestNumber', 'sentDate', 'description', 'totalAmount'].includes(key)) Object.assign(input.header, { [key]: null });
    expect(validateCreatePurchase(input)).toEqual([]);
  });
  it.each(['requestNumber', 'sentDate', 'description', 'totalAmount'])('exige %s y rechaza propiedades de servidor', key => {
    const input = structuredClone(manualPurchaseExample); Object.assign(input.header, { [key]: null });
    expect(Value.Check(CreatePurchaseSchema, input)).toBe(false);
    expect(validateCreatePurchase({ ...manualPurchaseExample, reviewStatus: 'reviewed' }).length).toBeGreaterThan(0);
  });
  it('rechaza fechas inexistentes y límites; conserva montos exactos de 255 dígitos', () => {
    const input = structuredClone(manualPurchaseExample);
    input.header.sentDate = '2026-02-30'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.header.sentDate = '0000-01-01'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.header.sentDate = '2026-10-13'; input.header.totalAmount = '9'.repeat(255); expect(validateCreatePurchase(input)).toEqual([]);
    input.header.totalAmount = '9'.repeat(256); expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.header.totalAmount = '6.5'; expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
    input.header.totalAmount = '0'; input.lines = Array.from({ length: 101 }, () => structuredClone(manualPurchaseExample.lines[0]!));
    expect(validateCreatePurchase(input).length).toBeGreaterThan(0);
  });
});
