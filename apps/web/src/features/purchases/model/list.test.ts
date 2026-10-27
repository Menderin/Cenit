import { describe, expect, it } from 'vitest';
import { paginationPages, periodRange, selectedPeriod } from './list.js';

describe('consulta del historial de compras', () => {
  it('convierte año/mes en fechas civiles inclusivas, con años bisiestos y cambio de año', () => {
    expect(periodRange('2024', '02')).toEqual({ dateFrom: '2024-02-01', dateTo: '2024-02-29' });
    expect(periodRange('2023', '02').dateTo).toBe('2023-02-28');
    expect(periodRange('2026', '12')).toEqual({ dateFrom: '2026-12-01', dateTo: '2026-12-31' });
    expect(periodRange('0001', '02').dateTo).toBe('0001-02-28');
    expect(periodRange('2026')).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(periodRange('')).toEqual({ dateFrom: '', dateTo: '' });
    for (const [year, month] of [['2024', '02'], ['2026', '12'], ['2026', '']] as const) expect(selectedPeriod(periodRange(year, month))).toEqual({ year, month });
    expect(selectedPeriod({ dateFrom: '2026-10-01', dateTo: '2026-11-30' })).toEqual({ year: 'custom', month: '' });
    expect(selectedPeriod({ dateFrom: '31/12/' }).year).toBe('custom');
    expect(selectedPeriod({})).toEqual({ year: '', month: '' });
  });

  it('mantiene accesos al inicio/final sin dibujar cuarenta botones', () => {
    expect(paginationPages(1, 40)).toEqual([1, 2, 'ellipsis', 40]);
    expect(paginationPages(20, 40)).toEqual([1, 'ellipsis', 19, 20, 21, 'ellipsis', 40]);
    expect(paginationPages(40, 40)).toEqual([1, 'ellipsis', 39, 40]);
    expect(paginationPages(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationPages(1, 1)).toEqual([1]);
  });
});
