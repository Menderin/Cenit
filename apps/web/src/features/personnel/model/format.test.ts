import { describe, expect, it } from 'vitest';
import { formatAmount, formatRut } from './format.js';

describe('formato mientras se escribe', () => {
  it('agrega puntos y guion al RUT, incluido K', () => {
    expect(formatRut('154829032')).toBe('15.482.903-2');
    expect(formatRut('16051938k')).toBe('16.051.938-K');
    expect(formatRut('15.482.903-2')).toBe('15.482.903-2');
    expect(formatRut('1234')).toBe('123-4');
    expect(formatRut('1')).toBe('1');
    expect(formatRut('ab')).toBe('');
  });
  it('separa miles del importe y conserva hasta dos decimales', () => {
    expect(formatAmount('186000')).toBe('186.000');
    expect(formatAmount('1.234.567,891')).toBe('1.234.567,89');
    expect(formatAmount('1234,')).toBe('1.234,');
    expect(formatAmount('007')).toBe('7');
    expect(formatAmount('abc')).toBe('');
  });
});
