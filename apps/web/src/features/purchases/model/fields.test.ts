import { describe, expect, it } from 'vitest';
import { amountLabel, normalizeAmountInput, purchaseProblemLabel } from './fields.js';

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

it('nombra recuadros y errores con las columnas de la planilla', () => {
  expect(purchaseProblemLabel('/record/description')).toBe('DETALLE');
  expect(purchaseProblemLabel('/header/totalAmount')).toBe('Monto');
  expect(purchaseProblemLabel('/header/sender')).toBe('Desde');
  expect(purchaseProblemLabel('/lines/0/chargeAccount')).toBe('Línea 1 · Cuenta de cargo');
});
