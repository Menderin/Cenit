import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateCatalog } from './catalog.js';
import type { AcademicPlan } from '@cenit/contracts/academic';
const source = (): AcademicPlan => JSON.parse(readFileSync('catalogs/academic/nutricion-2027-r1.json', 'utf8'));
describe('validación del catálogo', () => {
  it('conserva 52 asignaturas, SCT y bloque IX–X sin inferir reglas', () => {
    const plan = validateCatalog(source());
    expect(plan.courses).toHaveLength(52);
    expect(plan.courses.reduce((sum, c) => sum + (c.credits ?? 0), 0)).toBe(305);
    expect(plan.courses.filter(c => c.semester === 9)).toHaveLength(4);
    expect(plan.courses.filter(c => c.semester === 9).every(c => c.semesterEnd === 10)).toBe(true);
    expect(plan.courses.every(c => c.prerequisites.kind === 'pending' && c.officialCode === null)).toBe(true);
  });
  it.each(['duplicate', 'missing', 'self', 'cycle', 'semester', 'source', 'pending-as-none'] as const)('rechaza %s', kind => {
    const p = source(); const first = p.courses[0]!;
    if (kind === 'duplicate') p.courses[1]!.code = first.code;
    if (kind === 'missing') p.prerequisiteEdges[0]!.fromCode = 'NO-EXISTE';
    if (kind === 'self') p.prerequisiteEdges[0]!.fromCode = p.prerequisiteEdges[0]!.toCode;
    if (kind === 'cycle') p.prerequisiteEdges.push({ ...p.prerequisiteEdges[0]!, fromCode: p.prerequisiteEdges[0]!.toCode, toCode: p.prerequisiteEdges[0]!.fromCode });
    if (kind === 'semester') first.semesterEnd = 0;
    if (kind === 'source') p.prerequisiteEdges[0]!.sourceId = 'ausente';
    if (kind === 'pending-as-none') p.courses.find(c => c.code === p.prerequisiteEdges[0]!.toCode)!.prerequisites = { kind: 'none' };
    expect(() => validateCatalog(p)).toThrow();
  });
  it('valida referencias y ciclos también dentro de AND/OR', () => {
    const p = source(); p.prerequisiteEdges = [];
    p.courses[0]!.prerequisites = { kind: 'anyOf', rules: [{ kind: 'course', code: p.courses[1]!.code }, { kind: 'none' }] };
    p.courses[1]!.prerequisites = { kind: 'course', code: p.courses[0]!.code };
    expect(() => validateCatalog(p)).toThrow(/Ciclo/);
  });
  it('rechaza reglas excesivamente profundas antes de desbordar validación', () => {
    const p = source(); let rule: unknown = { kind: 'none' };
    for (let i = 0; i < 50; i++) rule = { kind: 'allOf', rules: [rule, { kind: 'none' }] };
    (p.courses[0] as unknown as { prerequisites: unknown }).prerequisites = rule;
    expect(() => validateCatalog(p)).toThrow(/límites|profundidad/);
  });
});
