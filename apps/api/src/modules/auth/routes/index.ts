import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import { LoginRequestSchema, LogoutRequestSchema, SessionResponseSchema, type LoginRequest } from '@cenit/contracts/auth';
import { ApiError } from '../../../infrastructure/errors.js';
import { AuthService, SESSION_SECONDS } from '../services/auth.js';

export const SESSION_COOKIE = 'cenit_session';
export type AuthConfig = { allowedOrigins: string[]; cookieSecure: boolean };
export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const raw = env.AUTH_COOKIE_SECURE ?? 'true';
  if (!['true', 'false'].includes(raw)) throw new Error('AUTH_COOKIE_SECURE inválido.');
  if (raw === 'false' && !['demo', 'development', 'test'].includes(env.APP_ENV ?? '')) throw new Error('HTTP permitido sólo con configuración explícita de demo/desarrollo.');
  const allowedOrigins = (env.AUTH_ALLOWED_ORIGINS ?? 'http://127.0.0.1:3000,http://localhost:3000').split(',');
  if (!allowedOrigins.length || allowedOrigins.some(origin => {
    try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password; } catch { return true; }
  })) throw new Error('AUTH_ALLOWED_ORIGINS requiere orígenes exactos.');
  return { allowedOrigins, cookieSecure: raw === 'true' };
}
export async function authRoutes(app: FastifyInstance, options: { service: AuthService; config: AuthConfig }) {
  const { service, config } = options;
  const origin = async (request: FastifyRequest) => {
    if (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin)) throw new ApiError(403, 'FORBIDDEN', 'Origen no autorizado.');
  };
  const errors = Object.fromEntries([400, 401, 403, 429, 500, 503].map(status => [status, ErrorResponseSchema]));
  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure };
  app.post<{ Body: LoginRequest }>('/login', {
    schema: { body: LoginRequestSchema, response: { 200: SessionResponseSchema, ...errors } }, onRequest: origin,
    preValidation: async request => { if (request.body && typeof request.body.email === 'string') request.body.email = request.body.email.trim(); },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const result = await service.login(request.body, request.cookies[SESSION_COOKIE]);
    reply.setCookie(SESSION_COOKIE, result.token, { ...cookieOptions, maxAge: SESSION_SECONDS, expires: new Date(result.response.data.expiresAt) });
    return result.response;
  });
  app.get('/session', { schema: { response: { 200: SessionResponseSchema, ...errors } } }, async request => {
    const result = await service.session(request.cookies[SESSION_COOKIE]);
    if (!result) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.');
    return result;
  });
  app.post('/logout', { schema: { body: LogoutRequestSchema, response: errors }, onRequest: origin }, async (request, reply) => {
    await service.logout(request.cookies[SESSION_COOKIE]);
    return reply.clearCookie(SESSION_COOKIE, cookieOptions).code(204).send();
  });
}
