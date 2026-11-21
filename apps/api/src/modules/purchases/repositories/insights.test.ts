import { describe, expect, it } from 'vitest';
import { costCenterName } from './insights.js';

describe('nombres desde el centro de costos de Oracle', () => {
  const text = '270101-Decanatura Facultad de Medicina / 00000000-Sin Proyecto / 410103-Remuneraciones Profesores Hora P. Temporal. Acádémica G.Op.';
  it('toma el nombre que acompaña al mismo código en su posición', () => {
    expect(costCenterName(text, 0, '270101')).toBe('Decanatura Facultad de Medicina');
    expect(costCenterName(text, 1, '00000000')).toBe('Sin Proyecto');
    expect(costCenterName(text, 2, '410103')).toBe('Remuneraciones Profesores Hora P. Temporal. Acádémica G.Op.');
  });
  it('acepta separadores sin espacios y no deduce nombres de otro código', () => {
    expect(costCenterName('270101-Decanatura/00000000-Sin Proyecto / 410103-Remuneraciones', 1, '00000000')).toBe('Sin Proyecto');
    expect(costCenterName(text, 1, '20702029')).toBeNull();
    expect(costCenterName(null, 1, '00000000')).toBeNull();
    expect(costCenterName('Texto libre sin códigos', 1, '00000000')).toBeNull();
  });
});
