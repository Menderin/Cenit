import { describe, expect, it } from 'vitest';
import { commissionAllowance, commissionDate, emptyCommission, validateStep } from './commission.js';

describe('validación provisional de la comisión', () => {
  it('detecta fechas invertidas y permite días y viático vacíos', () => {
    const draft = { ...emptyCommission(), territory: 'nacional' as const, place: 'Antofagasta', from: '2026-11-12', to: '2026-11-11', totalDays: '1' };
    expect(validateStep(draft, 'comision')).toEqual({ to: 'Debe ser igual o posterior al inicio.' });
    expect(validateStep({ ...draft, to: '2026-11-12' }, 'comision')).toEqual({});
  });

  it('exige completar una segunda fuente cuando se ingresa parcialmente', () => {
    const draft = emptyCommission();
    draft.funding[0] = { institution: '0001', organization: '02', unit: '003', project: '004', percent: '100' };
    draft.funding[1].project = '005';
    expect(validateStep(draft, 'financiamiento')).toEqual({
      'funding.1.institution': 'Completa o vacía la fila.',
      'funding.1.organization': 'Completa o vacía la fila.',
      'funding.1.unit': 'Completa o vacía la fila.',
      'funding.1.percent': 'Completa o vacía la fila.',
    });
  });
});

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
