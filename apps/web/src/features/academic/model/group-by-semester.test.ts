import { expect, it } from 'vitest';
import { groupBySemester, semesterLabel } from './group-by-semester.js';
import type { AcademicCourse } from '@cenit/contracts/academic';
import catalog from '../../../../../../catalogs/academic/nutricion-2027-r1.json';

it('conserva las 52 asignaturas, sus códigos y SCT, sin duplicar IX–X', () => {
  const courses = catalog.courses as AcademicCourse[];
  const groups = groupBySemester([...courses].reverse());
  expect(groups.map(g => g.courses.length)).toEqual([7, 5, 6, 7, 6, 6, 6, 5, 4]);
  const flattened = groups.flatMap(g => g.courses);
  expect(new Set(flattened.map(c => c.code)).size).toBe(52);
  expect(flattened.reduce((sum, c) => sum + (c.credits ?? 0), 0)).toBe(305);
  expect(groups.at(-1)).toMatchObject({ semester: 9, semesterEnd: 10 });
  expect(groups.at(-1)!.courses.reduce((sum, c) => sum + c.credits!, 0)).toBe(65);
  expect(flattened.map(c => c.code)).toEqual(courses.map(c => c.code));
  expect(courses[0]!.code).toBe('NUT2027-001');
});

it('ordena intervalos sin convertirlos en semestres independientes', () => {
  const base = catalog.courses[0] as AcademicCourse;
  const groups = groupBySemester([
    { ...base, code: 'INTERVALO', semester: 9, semesterEnd: 10, displayOrder: 2 },
    { ...base, code: 'PRIMERO', semester: 1, semesterEnd: 1, displayOrder: 1 },
  ]);
  expect(groups.map(g => g.courses[0]!.code)).toEqual(['PRIMERO', 'INTERVALO']);
  expect(semesterLabel(9, 10)).toBe('Semestres IX–X');
  expect(groupBySemester([])).toEqual([]);
});
