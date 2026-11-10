import { describe, expect, it } from 'vitest';
import { commissionAllowance, commissionDate } from './commission.js';

describe('formatos impresos de la plantilla de comisión', () => {
  it('conserva la fecha civil y usa d/mmm/yy', () => {
    expect(commissionDate('2026-09-23')).toBe('23/sept/26');
    expect(commissionDate('2026-01-01')).toBe('1/ene/26');
    expect(commissionDate('')).toBe('');
  });
  it('imprime dos decimales sin perder precisión ni completar vacíos', () => {
    expect(commissionAllowance('27000')).toBe('27.000,00');
    expect(commissionAllowance('27.000,5')).toBe('27.000,50');
    expect(commissionAllowance('9007199254740993,01')).toBe('9.007.199.254.740.993,01');
    expect(commissionAllowance('')).toBe('');
    expect(commissionAllowance('0')).toBe('0,00');
  });
});
