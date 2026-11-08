import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import { GoogleAvailabilitySchema, GoogleChallengeRequestSchema, GoogleChallengeResponseSchema, GoogleCredentialRequestSchema,
  GoogleLinkResponseSchema, SessionResponseSchema, type GooglePurpose, type GoogleCredentialRequest } from '@cenit/contracts/auth';
import { ApiError } from '../../../infrastructure/errors.js';
import { SESSION_SECONDS } from '../services/auth.js';
import { GOOGLE_CHALLENGE_SECONDS, type GoogleService } from '../services/google.js';
import { SESSION_COOKIE, type AuthConfig } from './index.js';

export const GOOGLE_COOKIE = 'cenit_google_challenge';
export async function googleRoutes(app: FastifyInstance, options: { google?: GoogleService; config: AuthConfig }) {
  const { google, config } = options;
  const origin = async (request: FastifyRequest) => {
    if (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin)) throw new ApiError(403, 'FORBIDDEN', 'Origen no autorizado.');
  };
  const provider = () => {
    if (!google) throw new ApiError(503, 'GOOGLE_DISABLED', 'El acceso con Google no está habilitado. Usa el acceso local.');
    return google;
  };
  const errors = Object.fromEntries([400, 401, 403, 409, 429, 500, 503].map(status => [status, ErrorResponseSchema]));
  const cookieOptions = { path: '/api/v1/auth/google', httpOnly: true, sameSite: 'strict' as const, secure: config.cookieSecure };
  const limited = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  app.get('/google', { schema: { response: { 200: GoogleAvailabilitySchema } } }, () => google?.availability() ?? { data: { enabled: false, clientId: null } });
  app.post<{ Body: { purpose: GooglePurpose } }>('/google/challenge', {
    onRequest: origin, config: limited, schema: { body: GoogleChallengeRequestSchema, response: { 200: GoogleChallengeResponseSchema, ...errors } },
  }, async (request, reply) => {
    const result = await provider().challenge(request.body.purpose, request.cookies[SESSION_COOKIE], request.cookies[GOOGLE_COOKIE]);
    reply.setCookie(GOOGLE_COOKIE, result.token, { ...cookieOptions, maxAge: GOOGLE_CHALLENGE_SECONDS, expires: new Date(result.response.data.expiresAt) });
    return result.response;
  });
  app.get('/google/link', { schema: { response: { 200: GoogleLinkResponseSchema, ...errors } } }, request => provider().linkStatus(request.cookies[SESSION_COOKIE]));
  for (const purpose of ['login', 'link'] as const) app.post<{ Body: GoogleCredentialRequest }>(`/google/${purpose}`, {
    onRequest: origin, config: limited,
    schema: { body: GoogleCredentialRequestSchema, response: { 200: purpose === 'login' ? SessionResponseSchema : GoogleLinkResponseSchema, ...errors } },
  }, async (request, reply) => {
    reply.clearCookie(GOOGLE_COOKIE, cookieOptions);
    const result = await provider().complete(purpose, request.body.credential, request.cookies[GOOGLE_COOKIE], request.cookies[SESSION_COOKIE]);
    if (!result) return { data: { linked: true } };
    reply.setCookie(SESSION_COOKIE, result.token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure,
      maxAge: SESSION_SECONDS, expires: new Date(result.response.data.expiresAt) });
    return result.response;
  });
}
