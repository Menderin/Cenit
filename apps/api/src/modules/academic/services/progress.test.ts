import { it, expect } from 'vitest';
import { courseProgress, normalizeRutSearch, formatAcademicGrade } from './progress.js';
it('deriva nunca cursada sin crear intentos', () => expect(courseProgress('A', [])).toEqual({ code: 'A', status: 'notTaken', attemptCount: 0, passingGrade: null, attempts: [] }));
it('cuenta el intento en curso y conserva reprobación anterior', () => {
  expect(courseProgress('A', [{ attemptNumber: 2, status: 'inProgress', grade: null }, { attemptNumber: 1, status: 'failed', grade: '3' }])).toMatchObject({ status: 'inProgress', attemptCount: 2, passingGrade: null, attempts: [{ attemptNumber: 1 }, { attemptNumber: 2 }] });
});
it('conserva nota final de aprobación después de reprobación', () => {
  expect(courseProgress('A', [{ attemptNumber: 1, status: 'failed', grade: '3' }, { attemptNumber: 2, status: 'passed', grade: '5,2' }])).toMatchObject({ status: 'passed', attemptCount: 2, passingGrade: '5,2' });
});
it('normaliza sólo la clave de búsqueda del RUT', () => expect(normalizeRutSearch('00.000.001-k')).toBe('00000001-K'));
it.each([['4.1', '4,1'], ['6.0', '6'], ['6.00', '6'], ['6.5', '6,5'], ['6.50', '6,5'], ['7', '7'], [null, null]])('formatea %s como %s', (input, expected) => expect(formatAcademicGrade(input)).toBe(expected));
it.each(['6.55', '7.1', '0.9'])('no redondea silenciosamente una nota inválida %s', value => expect(() => formatAcademicGrade(value)).toThrow());
