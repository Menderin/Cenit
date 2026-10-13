import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { PlanResponseSchema, ProgressResponseSchema, StudentsResponseSchema, PlanParamsSchema, StudentSearchSchema, AttemptSchema } from './index.js';
import { ErrorResponseSchema } from '../common/index.js';
import { planExample, progressExample, studentsExample, errorExamples } from './examples.js';
describe('contratos y ejemplos académicos', () => {
  it('valida respuestas y errores documentados', () => {
    expect(Value.Check(PlanResponseSchema, { data: planExample })).toBe(true);
    expect(Value.Check(ProgressResponseSchema, progressExample)).toBe(true);
    expect(Value.Check(StudentsResponseSchema, studentsExample)).toBe(true);
    errorExamples.forEach(example => expect(Value.Check(ErrorResponseSchema, example.body)).toBe(true));
  });
  it('rechaza filtros extra, páginas inválidas y slugs arbitrarios', () => {
    expect(Value.Check(StudentSearchSchema, { page: 1, pageSize: 20 })).toBe(true);
    for (const query of [{ page: 0, pageSize: 20 }, { page: 1, pageSize: 101 }, { page: 1, pageSize: 20, role: 'docente' }, { page: 1, pageSize: 20, name: '   ' }]) expect(Value.Check(StudentSearchSchema, query)).toBe(false);
    expect(Value.Check(PlanParamsSchema, { planId: '../otra', version: '2027' })).toBe(false);
  });
  it('distingue reglas pendientes de ausencia confirmada', () => {
    const plan = structuredClone(planExample);
    plan.courses[0]!.prerequisites = { kind: 'none' };
    expect(Value.Check(PlanResponseSchema, { data: plan })).toBe(true);
    expect(Value.Check(PlanResponseSchema, { data: { ...plan, courses: [{ ...plan.courses[0], prerequisites: { kind: 'allOf', rules: [] } }] } })).toBe(false);
  });
  it('notas decimales exactas y estado coherente', () => {
    for (const grade of ['4', '4,1', '6', '6,5', '7']) expect(Value.Check(AttemptSchema, { attemptNumber: 1, status: 'passed', grade })).toBe(true);
    for (const attempt of [
      { attemptNumber: 1, status: 'passed', grade: '3.99' }, { attemptNumber: 1, status: 'passed', grade: '7.01' },
      { attemptNumber: 1, status: 'passed', grade: 5.25 }, { attemptNumber: 1, status: 'failed', grade: '4.00' },
      { attemptNumber: 1, status: 'failed', grade: '2.555' }, { attemptNumber: 1, status: 'inProgress', grade: '5.00' },
      { attemptNumber: 1, status: 'passed', grade: '6,0' }, { attemptNumber: 1, status: 'passed', grade: '6.5' },
      { attemptNumber: 1, status: 'passed', grade: '6,55' }, { attemptNumber: 1, status: 'passed', grade: '7,1' },
    ]) expect(Value.Check(AttemptSchema, attempt)).toBe(false);
  });
});
