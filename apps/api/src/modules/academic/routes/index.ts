import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '@cenit/contracts';
import { PlanParamsSchema, PlanResponseSchema, PlansResponseSchema, StudentParamsSchema, StudentSearchSchema, StudentsResponseSchema, ProgressResponseSchema } from '@cenit/contracts/academic';
import { AcademicError, AcademicService } from '../services/academic.js';

// Server-side adapter supplied by the login task. Never construct this from headers/body/role query parameters.
export type AcademicPrincipal = { accountId: string; role: 'docente' | 'estudiante' | 'administrativo' };
export type AuthenticateAcademic = (request: FastifyRequest) => Promise<AcademicPrincipal | null>;
export async function academicRoutes(app: FastifyInstance, options: { service: AcademicService; authenticate: AuthenticateAcademic }) {
  const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema, 503: ErrorResponseSchema };
  const principals = new WeakMap<FastifyRequest, AcademicPrincipal>();
  const access = (roles: AcademicPrincipal['role'][]) => async (request: FastifyRequest) => {
    const principal = await options.authenticate(request);
    if (!principal) throw new AcademicError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.');
    if (!principal.accountId || !roles.includes(principal.role)) throw new AcademicError(403, 'FORBIDDEN', 'No tienes acceso a este recurso.');
    principals.set(request, principal);
  };
  app.get('/plans', { schema: { response: { 200: PlansResponseSchema, ...errors } }, onRequest: access(['docente', 'estudiante']) }, () => options.service.plans());
  app.get<{ Params: Static<typeof PlanParamsSchema> }>('/plans/:planId/versions/:version', {
    schema: { params: PlanParamsSchema, response: { 200: PlanResponseSchema, ...errors } }, onRequest: access(['docente', 'estudiante']),
  }, request => options.service.plan(request.params.planId, request.params.version));
  app.get('/me/progress', { schema: { response: { 200: ProgressResponseSchema, ...errors } }, onRequest: access(['estudiante']) }, request => options.service.ownProgress(principals.get(request)!.accountId));
  app.get<{ Querystring: Static<typeof StudentSearchSchema> }>('/students', {
    schema: { querystring: StudentSearchSchema, response: { 200: StudentsResponseSchema, ...errors } }, onRequest: access(['docente']),
  }, request => options.service.students(request.query));
  app.get<{ Params: Static<typeof StudentParamsSchema> }>('/students/:studentId/progress', {
    schema: { params: StudentParamsSchema, response: { 200: ProgressResponseSchema, ...errors } }, onRequest: access(['docente']),
  }, request => options.service.progress(request.params.studentId));
}
