import { Value } from '@sinclair/typebox/value';
import { PlansResponseSchema, PlanResponseSchema, StudentsResponseSchema, ProgressResponseSchema, type PlansResponse, type AcademicPlan, type StudentSearch, type StudentsResponse, type ProgressResponse } from '@cenit/contracts/academic';
import { api, HttpError } from '../../../shared/lib/http.js';

async function read(path: string, signal?: AbortSignal) {
  const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
  try {
    const response = await api(path, { signal: bounded });
    return await response.json().catch(error => {
      if (bounded.aborted) throw error;
      return null;
    });
  }
  catch (error) {
    if (bounded.aborted && !signal?.aborted) throw new HttpError(0, 'La consulta tardó demasiado. Intenta nuevamente.');
    throw error;
  }
}

export async function getPlans(signal?: AbortSignal): Promise<PlansResponse['data']> {
  const body: unknown = await read('/academic/plans', signal);
  if (!Value.Check(PlansResponseSchema, body)) throw new HttpError(502, 'El servidor devolvió una lista de planes inválida.');
  return body.data;
}

export async function getPlan(planId: string, version: string, signal?: AbortSignal): Promise<AcademicPlan> {
  const body: unknown = await read(`/academic/plans/${encodeURIComponent(planId)}/versions/${encodeURIComponent(version)}`, signal);
  if (!Value.Check(PlanResponseSchema, body)) throw new HttpError(502, 'El servidor devolvió un catálogo inválido.');
  return body.data;
}

export const retryAcademicRead = (failures: number, error: Error) => failures < 2 && error instanceof HttpError && [0, 503].includes(error.status);

export async function getStudents(search: StudentSearch, signal?: AbortSignal): Promise<StudentsResponse> {
  const query = new URLSearchParams({ page: String(search.page), pageSize: String(search.pageSize),
    ...(search.name ? { name: search.name } : {}), ...(search.rut ? { rut: search.rut } : {}) });
  const body: unknown = await read(`/academic/students?${query}`, signal);
  if (!Value.Check(StudentsResponseSchema, body)) throw new HttpError(502, 'El servidor devolvió una lista de estudiantes inválida.');
  return body;
}

export async function getProgress(studentId: string | null, signal?: AbortSignal): Promise<ProgressResponse['data']> {
  const path = studentId === null ? '/academic/me/progress' : `/academic/students/${encodeURIComponent(studentId)}/progress`;
  const body: unknown = await read(path, signal);
  if (!Value.Check(ProgressResponseSchema, body)) throw new HttpError(502, 'El servidor devolvió un historial inválido.');
  if (studentId !== null && body.data.student.id !== studentId) throw new HttpError(502, 'El historial no corresponde al estudiante seleccionado.');
  return body.data;
}
