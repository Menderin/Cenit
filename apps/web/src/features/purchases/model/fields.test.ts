import { describe, expect, it } from 'vitest';
import { amountLabel, normalizeAmountInput } from './fields.js';
import { createReviewDraft, validateCreatePurchase, validateExtractionResponse } from '@cenit/contracts/purchases';
import { recoveredExample } from '../../../../../../packages/contracts/src/purchases/examples.js';

describe('montos de presentación de compras', () => {
  it('conserva enteros superiores al límite de precisión de Number', () => {
    expect(amountLabel('9007199254740993')).toBe('$9.007.199.254.740.993');
    expect(amountLabel('0')).toBe('$0');
  });
  it('distingue ausencia y conserva un borrador inválido sin romper el formulario', () => {
    expect(amountLabel(null)).toBe('Sin dato');
    expect(amountLabel('1,20')).toBe('1,20');
    expect(amountLabel('001')).toBe('001');
  });
});

describe('normalización de montos escritos', () => {
  it('acepta separadores de miles y signo peso', () => {
    expect(normalizeAmountInput('$1.250.000')).toBe('1250000');
    expect(normalizeAmountInput(' $ 1.250 ')).toBe('1250');
    expect(normalizeAmountInput('1 250 000')).toBe('1250000');
    expect(normalizeAmountInput('$200000')).toBe('200000');
  });
  it('no adivina formatos ambiguos o inválidos', () => {
    expect(normalizeAmountInput('1,5')).toBe('1,5');
    expect(normalizeAmountInput('1.25')).toBe('1.25');
    expect(normalizeAmountInput('12.50.000')).toBe('12.50.000');
    expect(normalizeAmountInput('-1.000')).toBe('-1.000');
    expect(normalizeAmountInput('')).toBe('');
  });
});

// Adapted from ihelo's PR #55 (35f336a), reusing the existing fictitious fixture.
it('traslada una corrección de impuesto al alta conservando origen, ceros y texto original', () => {
  const response = structuredClone(recoveredExample);
  response.data.header.taxAmount = { status: 'ambiguous', value: null, rawText: 'O CLP' };
  response.data.issues.push({ path: '/header/taxAmount', code: 'AMBIGUOUS_VALUE', message: 'Revisión requerida.' });
  response.data.origin = { type: 'image_capture', extractionId: response.data.extractionId,
    processorVersion: 'tesseract5-spa-grid8-layout-v1', processedAt: '2026-10-14T15:00:00.000Z', receipt: 'A'.repeat(43) };
  expect(validateExtractionResponse(response)).toEqual([]);
  const draft = createReviewDraft(response);
  expect(draft.header.taxAmount).toBeNull();
  draft.header.taxAmount = '0';
  expect(validateCreatePurchase({ ...draft, operationId: '00000000-0000-4000-8000-000000000001', origin: response.data.origin })).toEqual([]);
  expect(draft.header.requestNumber).toBe('000125');
  expect(draft.lines[0]!.projectCode).toBe('00000000');
  expect(response.data.header.taxAmount).toEqual({ status: 'ambiguous', value: null, rawText: 'O CLP' });
});
