import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readCatalog } from '../../../../../../db/seeds/load-academic.js';
import { validateCatalog } from './catalog.js';

const historicalBytes = readFileSync('catalogs/academic/nutricion-2027-r1.json');
const historical = validateCatalog(JSON.parse(historicalBytes.toString('utf8')));
const plan = readCatalog('catalogs/academic/nutricion-diagrama-r2.json');
const code = (n: number) => `NUT2027-${String(n).padStart(3, '0')}`;
const expectedPairs = [
  [1,8], [8,13], [8,14], [13,19], [13,20], [20,26], [19,26], [26,32],
  [32,39], [39,44], [32,38], [38,44], [40,44], [2,9], [9,14], [14,21],
  [15,21], [21,27], [22,27], [27,33], [33,40], [40,45], [3,10], [10,15],
  [15,22], [4,16], [16,23], [16,24], [23,28], [28,34], [34,41], [33,41],
  [41,46], [46,51], [28,35], [27,35], [11,17], [17,24], [24,29], [29,36],
  [36,42], [42,47], [6,12],
].map(([from, to]) => `${code(from!)}>${code(to!)}`).sort();

describe('diagrama-r2: cotejo y aclaraciones del equipo', () => {
  it('conserva el catálogo histórico y todos los datos de las asignaturas', () => {
    // Git uses LF; core.autocrlf may materialize CRLF without changing the catalog.
    expect(createHash('sha256').update(historicalBytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')).toBe('2ba11bfaf5c2261ee3ccb7c93206fc9df3f525132fc4cf485c498ced82bebe1d');
    const withoutRule = (course: typeof plan.courses[number]) => {
      const { prerequisites: _rule, ...fields } = course;
      return fields;
    };
    expect(plan.courses.map(withoutRule)).toEqual(historical.courses.map(withoutRule));
    expect(plan.courses).toHaveLength(52);
    expect(plan.courses.reduce((total, course) => total + course.credits!, 0)).toBe(305);
    expect(plan.courses.every(course => course.officialCode === null)).toBe(true);
    expect(plan.version).toBe('diagrama-r2');
  });

  it('contiene exactamente las 43 relaciones y reglas coherentes con sus extremos', () => {
    expect(plan.prerequisiteEdges.map(edge => `${edge.fromCode}>${edge.toCode}`).sort()).toEqual(expectedPairs);
    expect(plan.prerequisiteEdges.every(edge => edge.interpretation === 'confirmed')).toBe(true);
    for (const course of plan.courses) {
      const incoming = plan.prerequisiteEdges.filter(edge => edge.toCode === course.code).map(edge => edge.fromCode).sort();
      const rule = course.prerequisites;
      if (rule.kind === 'course') expect(incoming).toEqual([rule.code]);
      else if (rule.kind === 'allOf') expect(incoming).toEqual(rule.rules.map(child => child.kind === 'course' ? child.code : 'unexpected').sort());
      else { expect(rule.kind).toBe('pending'); expect(incoming).toEqual([]); }
    }
    expect(plan.courses.filter(course => course.prerequisites.kind === 'course')).toHaveLength(26);
    expect(plan.courses.filter(course => course.prerequisites.kind === 'allOf')).toHaveLength(8);
    expect(plan.courses.filter(course => course.prerequisites.kind === 'pending')).toHaveLength(18);
  });

  it.each([[35, [27,28]], [44, [38,39,40]]] as const)('conjunción aclarada de %s', (target, required) => {
    expect(plan.courses.find(course => course.code === code(target))!.prerequisites).toEqual({ kind: 'allOf', rules: required.map(n => ({ kind: 'course', code: code(n) })) });
  });

  it('limita la aclaración del internado APS a Proyecto de intervención comunitaria', () => {
    expect(plan.courses.find(course => course.code === code(51))!.prerequisites).toEqual({ kind: 'course', code: code(46) });
    expect(plan.prerequisiteEdges.find(edge => edge.toCode === code(51))!.sourceId).toBe('cotejo-equipo');
    for (const n of [49,50,52]) expect(plan.courses.find(course => course.code === code(n))!.prerequisites.kind).toBe('pending');
  });

  it('traza fuentes vigentes con hashes sin atribuir validación institucional o año oficial', () => {
    expect(plan.sources.map(source => source.validationStatus)).toEqual(['teamReviewed','teamReviewed']);
    expect(plan.source.reference).toBe('Docs/Foto prerequisitos Nutricion.jpeg');
    expect(plan.sources.map(source => source.reference)).toContain('Docs/COTEJO-CATALOGO-ACADEMICO.md');
    expect(plan.sources.every(source => !source.reference!.endsWith('.pdf'))).toBe(true);
    for (const source of plan.sources) expect(createHash('sha256').update(readFileSync(source.reference!)).digest('hex')).toBe(source.sha256);
  });

  it('rechaza referencias rotas y ciclos también en la nueva versión', () => {
    const broken = structuredClone(plan);
    broken.courses[0]!.prerequisites = { kind: 'course', code: 'ausente' };
    expect(() => validateCatalog(broken)).toThrow();
    broken.courses[0]!.prerequisites = { kind: 'course', code: code(8) };
    expect(() => validateCatalog(broken)).toThrow();
  });

  it('Git conserva exactamente los bytes de las fuentes al preparar un checkout', () => {
    for (const source of plan.sources) {
      const reference = source.reference!;
      const stored = execFileSync('git', ['hash-object', `--path=${reference}`, reference], { encoding: 'utf8' }).trim();
      const original = execFileSync('git', ['hash-object', '--no-filters', reference], { encoding: 'utf8' }).trim();
      expect(stored, `Conversión de Git sobre ${reference}: invalidaría el SHA-256 publicado`).toBe(original);
    }
  });
});
