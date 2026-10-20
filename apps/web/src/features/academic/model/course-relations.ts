import type { AcademicPlan } from '@cenit/contracts/academic';

// Recorre relaciones publicadas; no evalúa reglas ni habilitación académica.
export function courseRelations(plan: AcademicPlan, origin: string) {
  const codes = new Set(plan.courses.map(course => course.code));
  const outgoing = new Map<string, string[]>();
  for (const edge of plan.prerequisiteEdges) {
    if (!codes.has(edge.fromCode) || !codes.has(edge.toCode)) continue;
    const targets = outgoing.get(edge.fromCode);
    if (targets) targets.push(edge.toCode); else outgoing.set(edge.fromCode, [edge.toCode]);
  }
  const relations = new Map<string, { depth: number; via: string }>();
  const visited = new Set([origin]);
  const queue = [{ code: origin, depth: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const code of outgoing.get(current.code) ?? []) {
      if (visited.has(code)) continue;
      visited.add(code);
      relations.set(code, { depth: current.depth + 1, via: current.code });
      queue.push({ code, depth: current.depth + 1 });
    }
  }
  return relations;
}
