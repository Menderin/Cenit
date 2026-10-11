import { Value } from '@sinclair/typebox/value';
import { PlanSchema, type AcademicPlan, type Prerequisite } from '@cenit/contracts/academic';

export function canonicalJson(input: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    return value;
  };
  return JSON.stringify(normalize(input));
}

export function validateCatalog(input: unknown): AcademicPlan {
  // Bound recursion before recursive schema validation, including malformed input.
  const stack: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++nodes > 100000 || depth > 32) throw new Error('Catálogo excede los límites de estructura.');
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
    }
  }
  if (!Value.Check(PlanSchema, input)) throw new Error('Catálogo no cumple el contrato académico.');
  const plan = input;
  const codes = new Set<string>();
  const orders = new Set<number>();
  const graph = new Map<string, Set<string>>();
  const sources = new Set<string>();
  for (const source of plan.sources) {
    if (sources.has(source.sourceId)) throw new Error('Fuente duplicada.');
    sources.add(source.sourceId);
    if (source.validationStatus !== 'example' && !source.reviewedAt) throw new Error('Falta fecha de revisión.');
    if (source.reviewedAt && new Date(source.reviewedAt).toISOString().slice(0, 10) !== source.reviewedAt) throw new Error('Fecha de revisión inválida.');
  }
  const primary = plan.sources.find(source => source.sourceId === plan.source.sourceId);
  if (!primary || canonicalJson(primary) !== canonicalJson(plan.source)) throw new Error('Fuente principal inconsistente.');
  for (const course of plan.courses) {
    if (codes.has(course.code) || orders.has(course.displayOrder)) throw new Error('Código u orden duplicado.');
    if (course.semesterEnd < course.semester) throw new Error('Intervalo de semestres inválido.');
    if (course.credits !== null && Math.abs(course.credits * 100 - Math.round(course.credits * 100)) > 1e-7) throw new Error('SCT requiere hasta dos decimales.');
    codes.add(course.code); orders.add(course.displayOrder); graph.set(course.code, new Set());
  }
  const add = (from: string, to: string) => {
    if (!codes.has(from) || !codes.has(to)) throw new Error('Referencia de asignatura inexistente.');
    if (from === to) throw new Error('Autorreferencia académica.');
    graph.get(from)!.add(to);
  };
  for (const course of plan.courses) {
    let leaves = 0;
    const walk = (rule: Prerequisite, depth: number): void => {
      if (depth > 10) throw new Error('Regla excede profundidad máxima.');
      if (rule.kind === 'allOf' || rule.kind === 'anyOf') rule.rules.forEach(r => walk(r, depth + 1));
      else {
        if (++leaves > 100) throw new Error('Regla excede máximo de hojas.');
        if (rule.kind === 'course') add(rule.code, course.code);
      }
    };
    walk(course.prerequisites, 1);
  }
  const edges = new Set<string>();
  for (const edge of plan.prerequisiteEdges) {
    const key = JSON.stringify([edge.fromCode, edge.toCode]);
    if (edges.has(key)) throw new Error('Flecha duplicada.');
    edges.add(key);
    if (!sources.has(edge.sourceId)) throw new Error('Fuente de flecha inexistente.');
    add(edge.fromCode, edge.toCode);
    if (edge.interpretation === 'pending' && plan.courses.find(c => c.code === edge.toCode)!.prerequisites.kind !== 'pending') throw new Error('Una flecha pendiente no puede presentarse como regla resuelta.');
  }
  const active = new Set<string>(); const done = new Set<string>();
  const visit = (code: string): void => {
    if (active.has(code)) throw new Error('Ciclo de prerrequisitos.');
    if (done.has(code)) return;
    active.add(code); graph.get(code)!.forEach(visit); active.delete(code); done.add(code);
  };
  codes.forEach(visit);
  return plan;
}
