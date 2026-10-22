import { expect, it } from 'vitest';
import { courseRelations } from './course-relations.js';
import { relationPlan } from '../../../../../../tests/e2e/support/academic-relations.js';

it('recorre sólo descendientes, conserva distancia mínima y evita duplicados, ciclos y referencias rotas', () => {
  const plan = structuredClone(relationPlan);
  plan.prerequisiteEdges.push({ ...plan.prerequisiteEdges[0]!, fromCode: 'E', toCode: 'A' }, { ...plan.prerequisiteEdges[0]!, fromCode: 'A', toCode: 'NO-EXISTE' });
  expect([...courseRelations(plan, 'A')]).toEqual([
    ['B', { depth: 1, via: 'A' }], ['C', { depth: 1, via: 'A' }],
    ['D', { depth: 2, via: 'B' }], ['E', { depth: 3, via: 'D' }],
    ['F', { depth: 4, via: 'E' }], ['G', { depth: 5, via: 'F' }], ['H', { depth: 6, via: 'G' }],
    ['I', { depth: 7, via: 'H' }], ['J', { depth: 8, via: 'I' }], ['K', { depth: 9, via: 'J' }],
  ]);
  expect([...courseRelations(relationPlan, 'B').keys()]).toEqual(['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']);
  expect(courseRelations(relationPlan, 'Z').size).toBe(0);
});
