import type { AcademicPlan, Prerequisite } from '@cenit/contracts/academic';
import { planExample } from '@cenit/contracts/academic/examples';

// Sólo respuestas controladas del navegador: no se publican ni cargan en PostgreSQL.
export const prerequisiteCases: { kind: Prerequisite['kind']; name: string; rule: Prerequisite; text: string[] }[] = [
  { kind: 'course', name: 'Ejemplo: requisito simple', rule: { kind: 'course', code: 'DEMO-A' }, text: ['Bases ficticias A'] },
  { kind: 'allOf', name: 'Ejemplo: todos', rule: { kind: 'allOf', rules: [{ kind: 'course', code: 'DEMO-A' }, { kind: 'course', code: 'DEMO-B' }] }, text: ['Todos los siguientes:', 'Bases ficticias A', 'Bases ficticias B'] },
  { kind: 'anyOf', name: 'Ejemplo: alternativas', rule: { kind: 'anyOf', rules: [{ kind: 'course', code: 'DEMO-A' }, { kind: 'course', code: 'DEMO-B' }] }, text: ['Al menos uno de los siguientes:', 'Bases ficticias A', 'Bases ficticias B'] },
  { kind: 'none', name: 'Ejemplo: ninguno confirmado', rule: { kind: 'none' }, text: ['Sin prerrequisitos. Ausencia confirmada en esta versión del plan.'] },
  { kind: 'pending', name: 'Ejemplo: pendiente', rule: { kind: 'pending', description: 'Falta confirmar la condición y el sentido de la relación del ejemplo.' }, text: ['Pendientes de confirmación.', 'Falta confirmar la condición y el sentido de la relación del ejemplo.', 'En la malla', 'no son requisitos de inscripción'] },
  { kind: 'unsupported', name: 'Ejemplo: no soportado', rule: { kind: 'unsupported', description: 'El ejemplo requiere una autorización especial que este catálogo no puede representar.' }, text: ['Regla no soportada.', 'El ejemplo requiere una autorización especial que este catálogo no puede representar.', 'No se interpreta como ausencia de prerrequisitos.'] },
];

export const prerequisitePlan: AcademicPlan = {
  ...planExample, name: 'Plan ficticio de revisión de prerrequisitos',
  courses: [
    ...['A', 'B'].map((letter, index) => ({ ...planExample.courses[0]!, code: `DEMO-${letter}`, name: `Bases ficticias ${letter}`, semester: 1, semesterEnd: 1, displayOrder: index + 1 })),
    ...prerequisiteCases.map((example, index) => ({ ...planExample.courses[0]!, code: `DEMO-${example.kind}`, name: example.name, semester: 2, semesterEnd: 2, displayOrder: index + 3, prerequisites: example.rule })),
  ],
  prerequisiteEdges: [{ fromCode: 'DEMO-A', toCode: 'DEMO-pending', sourceId: planExample.source.sourceId, interpretation: 'pending', note: 'Relación ficticia sin interpretación confirmada.' }],
};
