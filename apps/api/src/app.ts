import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { ApiError } from './infrastructure/errors.js';
import { authRoutes, SESSION_COOKIE, type AuthConfig } from './modules/auth/routes/index.js';
import type { AuthService } from './modules/auth/services/auth.js';
import { academicRoutes, type AuthenticateAcademic } from './modules/academic/routes/index.js';
import { AcademicService, type AcademicReadRepository } from './modules/academic/services/academic.js';

import { PurchaseRepository } from './modules/purchases/repositories/purchases.js';
import { PurchaseService } from './modules/purchases/services/purchases.js';
import { purchaseRoutes } from './modules/purchases/routes/index.js';
import { registerFrontend } from './infrastructure/plugins/frontend.js';

export function buildAcademicApp(options: { repository: AcademicReadRepository; purchases?: PurchaseRepository; frontendRoot?: string; authenticate?: AuthenticateAcademic; auth?: { service: AuthService; config: AuthConfig } }) {
  if (options.auth && options.authenticate) throw new Error('No combinar sesión real con adaptador de identidad de prueba.');
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
    let status = 500; let code = 'INTERNAL_ERROR'; let message = 'No fue posible completar la solicitud.';
    if (error instanceof ApiError) { status = error.status; code = error.code; message = error.message; }
    else if (error.code === 'AUTH_RATE_LIMIT') { status = 429; code = 'RATE_LIMIT_EXCEEDED'; message = 'Demasiados intentos. Inténtalo más tarde.'; }
    else if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'La solicitud supera el tamaño permitido.'; }
    else if (error.validation || ['FST_ERR_CTP_INVALID_JSON_BODY', 'FST_ERR_CTP_EMPTY_JSON_BODY', 'FST_ERR_CTP_INVALID_MEDIA_TYPE', 'FST_ERR_CTP_BODY_TOO_LARGE'].includes(error.code ?? '')) { status = 400; code = 'VALIDATION_ERROR'; message = 'Revisa los datos de la solicitud.'; }
    else if (['42P01', 'ECONNREFUSED', '57P01', '57P03', 'ETIMEDOUT', '08006', '53300'].includes(error.code ?? '')) { status = 503; code = 'SERVICE_UNAVAILABLE'; message = 'El servicio no está disponible.'; }
    return reply.status(status).send({ error: { code, message, requestId: request.id } });
  });
  if (options.frontendRoot) registerFrontend(app, options.frontendRoot);
  else app.setNotFoundHandler((request, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso inexistente.', requestId: request.id } }));
  if (options.auth) {
    app.register(cookie);
    app.register(rateLimit, { global: false, errorResponseBuilder: () => Object.assign(new Error('Rate limit'), { code: 'AUTH_RATE_LIMIT', statusCode: 429 }) });
    app.register(authRoutes, { prefix: '/api/v1/auth', ...options.auth });
  }
  const authenticate: AuthenticateAcademic = options.auth ? async request => {
    const session = await options.auth!.service.session(request.cookies[SESSION_COOKIE]);
    return session ? { accountId: session.data.account.id, role: session.data.account.role } : null;
  } : options.authenticate ?? (async () => null);
  app.register(academicRoutes, { prefix: '/api/v1/academic', service: new AcademicService(options.repository), authenticate });
  if (options.purchases) app.register(purchaseRoutes, { prefix: '/api/v1/purchases', service: new PurchaseService(options.purchases), authenticate, allowedOrigins: options.auth?.config.allowedOrigins ?? [] });
  return app;
}
