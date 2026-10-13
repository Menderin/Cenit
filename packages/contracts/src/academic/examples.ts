import type { AcademicPlan, ProgressResponse, StudentsResponse } from './index.js';
const source = { sourceId: 'demo-source', title: 'Ejemplo de contrato', reference: null, sha256: '0'.repeat(64), reviewedAt: null, validationStatus: 'example' as const };
export const planExample: AcademicPlan = {
  planId: 'nutricion-dietetica', version: 'example-r1', name: 'Nutrición y Dietética', isExample: true,
  source, sources: [source],
  courses: [{ code: 'DEMO-001', codeKind: 'internal', officialCode: null, name: 'Asignatura ficticia', semester: 9, semesterEnd: 10, credits: 13, displayOrder: 1, prerequisites: { kind: 'pending', description: 'Interpretación pendiente de confirmar.' } }], prerequisiteEdges: [],
};
export const studentsExample: StudentsResponse = { data: [{ id: '123e4567-e89b-42d3-a456-426614174001', name: 'Estudiante Demo', rut: '00.000.001-0' }], page: 1, pageSize: 20, totalItems: 1 };
export const progressExample: ProgressResponse = { data: {
  student: studentsExample.data[0]!, plan: { planId: planExample.planId, version: planExample.version }, origin: 'demo',
  courses: [
    { code: 'DEMO-001', status: 'passed', attemptCount: 2, passingGrade: '5,2', attempts: [{ attemptNumber: 1, status: 'failed', grade: '3' }, { attemptNumber: 2, status: 'passed', grade: '5,2' }] },
    { code: 'DEMO-002', status: 'inProgress', attemptCount: 1, passingGrade: null, attempts: [{ attemptNumber: 1, status: 'inProgress', grade: null }] },
    { code: 'DEMO-003', status: 'failed', attemptCount: 1, passingGrade: null, attempts: [{ attemptNumber: 1, status: 'failed', grade: '2,5' }] },
    { code: 'DEMO-004', status: 'notTaken', attemptCount: 0, passingGrade: null, attempts: [] },
  ],
} };
export const errorExamples = [
  { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Revisa los parámetros de la consulta.', requestId: 'demo-request-1' } } },
  { status: 401, body: { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.', requestId: 'demo-request-2' } } },
  { status: 403, body: { error: { code: 'FORBIDDEN', message: 'No tienes acceso a este recurso.', requestId: 'demo-request-3' } } },
  { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Estudiante o plan inexistente.', requestId: 'demo-request-4' } } },
];
