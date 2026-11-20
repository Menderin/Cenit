import type { AcademicPlan, ProgressResponse } from '@cenit/contracts/academic';
import { planExample } from '../../../packages/contracts/src/academic/examples.js';

// Malla y conexiones ficticias exclusivas del mockup; no se publican en PostgreSQL.
const semesters = [
  [['A', 'Bases de nutrición'], ['X', 'Comunicación'], ['P1', 'Biología'], ['Q1', 'Química'], ['R1', 'Matemática']],
  [['B', 'Nutrición aplicada'], ['C', 'Alimentos y salud'], ['Y', 'Inglés'], ['P2', 'Bioquímica'], ['Q2', 'Anatomía']],
  [['D', 'Evaluación nutricional'], ['Z', 'Formación general'], ['P3', 'Fisiología'], ['Q3', 'Microbiología'], ['R3', 'Estadística']],
  [['E', 'Práctica integrada'], ['P4', 'Metabolismo'], ['Q4', 'Inocuidad alimentaria'], ['R4', 'Epidemiología'], ['S4', 'Métodos de investigación']],
  [['F', 'Nutrición clínica I'], ['P5', 'Dietoterapia I'], ['Q5', 'Nutrición comunitaria I'], ['R5', 'Bromatología'], ['S5', 'Procesos alimentarios']],
  [['G', 'Nutrición clínica II'], ['P6', 'Dietoterapia II'], ['Q6', 'Nutrición comunitaria II'], ['R6', 'Gestión alimentaria'], ['S6', 'Investigación aplicada']],
  [['H', 'Nutrición infantil'], ['P7', 'Alimentación colectiva'], ['Q7', 'Intervención comunitaria'], ['R7', 'Formulación de proyectos'], ['S7', 'Práctica integrada II']],
  [['I', 'Nutrición del adulto'], ['P8', 'Gestión de calidad'], ['Q8', 'Políticas alimentarias'], ['R8', 'Investigación I'], ['S8', 'Práctica profesional']],
  [['J', 'Internado clínico'], ['P9', 'Internado comunitario'], ['Q9', 'Internado de gestión'], ['R9', 'Trabajo de título I'], ['S9', 'Electivo profesional']],
  [['K', 'Práctica clínica avanzada'], ['P10', 'Práctica comunitaria avanzada'], ['Q10', 'Gestión profesional'], ['R10', 'Trabajo de título II'], ['S10', 'Seminario final']],
] as const;
const edges = [
  ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E'], ['E', 'F'], ['F', 'G'], ['G', 'H'], ['H', 'I'], ['I', 'J'], ['J', 'K'],
  ['X', 'P2'], ['P2', 'Q3'], ['Q3', 'P4'], ['P4', 'Q5'], ['Q5', 'P6'], ['P6', 'Q7'], ['Q7', 'P8'], ['P8', 'Q9'], ['Q9', 'P10'],
  ['R1', 'Y'], ['Y', 'R3'], ['R3', 'S4'], ['S4', 'S5'], ['S5', 'S6'], ['S6', 'S7'], ['S7', 'S8'], ['S8', 'S9'], ['S9', 'S10'],
] as const;
export const relationPlan: AcademicPlan = {
  ...planExample, name: 'Nutrición y Dietética', version: 'diagrama-r2',
  courses: semesters.flatMap((courses, semester) => courses.map(([code, name], index) => ({ ...planExample.courses[0]!, code, name, semester: semester + 1, semesterEnd: semester + 1, credits: 6, displayOrder: semester * 5 + index + 1, prerequisites: { kind: 'pending', description: 'Los prerrequisitos de esta asignatura están pendientes de confirmación.' } }))),
  prerequisiteEdges: edges.map(([fromCode, toCode]) => ({ fromCode, toCode, sourceId: planExample.source.sourceId, interpretation: 'pending', note: 'Conexión ficticia del mockup.' })),
};

export const relationProgress: ProgressResponse['data'] = {
  student: { id: '10000000-0000-4000-8000-000000000001', name: 'Estudiante ficticio', rut: '20.123.456-5' },
  plan: { planId: relationPlan.planId, version: relationPlan.version }, origin: 'demo',
  courses: relationPlan.courses.map<ProgressResponse['data']['courses'][number]>((course, index) => {
    if (course.semester <= 2) return { code: course.code, status: 'passed', attemptCount: 1, passingGrade: '5,5', attempts: [{ attemptNumber: 1, status: 'passed', grade: '5,5' }] };
    if (course.semester === 3 && index % 2 === 0) return { code: course.code, status: 'failed', attemptCount: 1, passingGrade: null, attempts: [{ attemptNumber: 1, status: 'failed', grade: '3,2' }] };
    if (course.semester === 3) return { code: course.code, status: 'inProgress', attemptCount: 1, passingGrade: null, attempts: [{ attemptNumber: 1, status: 'inProgress', grade: null }] };
    return { code: course.code, status: 'notTaken', attemptCount: 0, passingGrade: null, attempts: [] };
  }),
};
