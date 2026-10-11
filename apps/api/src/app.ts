import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { academicRoutes, type AuthenticateAcademic } from './modules/academic/routes/index.js';
import { AcademicError, AcademicService, type AcademicReadRepository } from './modules/academic/services/academic.js';

export function buildAcademicApp(options: { repository: AcademicReadRepository; authenticate?: AuthenticateAcademic }) {
  const app = Fastify({ bodyLimit: 128 * 1024, genReqId: () => randomUUID(), ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  // Query-only coercion keeps HTTP pagination usable without accepting role/body coercion.
  app.addHook('preValidation', async request => {
    if (request.routeOptions.url !== '/api/v1/academic/students') return;
    const query = request.query as Record<string, unknown>;
    query.page ??= 1; query.pageSize ??= 20;
    for (const key of ['page', 'pageSize']) if (typeof query[key] === 'string' && /^[1-9][0-9]*$/.test(query[key])) query[key] = Number(query[key]);
  });
  app.addHook('onSend', async (request, reply) => { reply.header('X-Request-Id', request.id); reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error: Error & { validation?: unknown; code?: string }, request, reply) => {
    let status = 500; let code = 'INTERNAL_ERROR'; let message = 'No fue posible completar la consulta.';
    if (error instanceof AcademicError) { status = error.status; code = error.code; message = error.message; }
    else if (error.validation) { status = 400; code = 'VALIDATION_ERROR'; message = 'Revisa los parámetros de la consulta.'; }
    else if (['42P01', 'ECONNREFUSED', '57P01', 'ETIMEDOUT'].includes(error.code ?? '')) { status = 503; code = 'SERVICE_UNAVAILABLE'; message = 'El módulo académico aún no está disponible.'; }
    return reply.status(status).send({ error: { code, message, requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso inexistente.', requestId: request.id } }));
  app.register(academicRoutes, { prefix: '/api/v1/academic', service: new AcademicService(options.repository), authenticate: options.authenticate ?? (async () => null) });
  return app;
}
