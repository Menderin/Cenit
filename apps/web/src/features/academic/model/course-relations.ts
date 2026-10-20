import type { AcademicPlan } from '@cenit/contracts/academic';

// Recorre relaciones publicadas; no evalúa reglas ni habilitación académica.
export function courseRelations(plan: AcademicPlan, origin: string) {
  const codes = new Set(plan.courses.map(course => course.code));
  const relations = new Map<string, { depth: number; via: string }>();
  const visited = new Set([origin]);
  const queue = [{ code: origin, depth: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const edge of plan.prerequisiteEdges) {
      if (edge.fromCode !== current.code || !codes.has(edge.toCode) || visited.has(edge.toCode)) continue;
      visited.add(edge.toCode);
      relations.set(edge.toCode, { depth: current.depth + 1, via: current.code });
      queue.push({ code: edge.toCode, depth: current.depth + 1 });
    }
  }
  return relations;
}
