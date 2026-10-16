import { describe, expect, it } from 'vitest';
import { amountLabel } from './fields.js';

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
