import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import { CreatePurchaseSchema, PurchaseListQuerySchema, PurchaseListResponseSchema, PurchaseParamsSchema, PurchaseResponseSchema, PurchaseValidationSchema, type CreatePurchase, type PurchaseListQuery } from '@cenit/contracts/purchases';
import type { Authenticate } from '../../auth/services/principal.js';
import { ApiError } from '../../../infrastructure/errors.js';
import type { PurchaseService } from '../services/purchases.js';

export async function purchaseRoutes(app: FastifyInstance, options: { service: PurchaseService; authenticate: Authenticate; allowedOrigins: string[] }) {
  const actors = new WeakMap<FastifyRequest, string>();
  const access = async (request: FastifyRequest) => {
    const principal = await options.authenticate(request);
    if (!principal) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.');
    if (principal.role !== 'administrativo') throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a este recurso.');
    actors.set(request, principal.accountId);
  };
  const write = async (request: FastifyRequest) => {
    await access(request);
    if (!request.headers.origin || !options.allowedOrigins.includes(request.headers.origin)) throw new ApiError(403, 'FORBIDDEN', 'Origen no autorizado.');
  };
  const errors = Object.fromEntries([400, 401, 403, 404, 409, 413, 500, 503].map(status => [status, ErrorResponseSchema]));
  app.post<{ Body: CreatePurchase }>('/', { bodyLimit: 512 * 1024, schema: { body: CreatePurchaseSchema, response: { 200: PurchaseResponseSchema, 201: PurchaseResponseSchema, ...errors } }, onRequest: write }, async (request, reply) => {
    const result = await options.service.create(request.body, actors.get(request)!);
    return reply.code(result.created ? 201 : 200).send({ data: result.record });
  });
  app.get<{ Querystring: PurchaseListQuery }>('/', { schema: { querystring: PurchaseListQuerySchema, response: { 200: PurchaseListResponseSchema, ...errors } }, onRequest: access,
    preValidation: async request => {
      const query = request.query as unknown as Record<string, unknown>;
      query.page ??= 1; query.pageSize ??= 20;
      if (typeof query.q === 'string') query.q = query.q.trim();
      for (const key of ['page', 'pageSize']) if (typeof query[key] === 'string' && /^[1-9][0-9]*$/.test(query[key])) query[key] = Number(query[key]);
    },
  }, request => options.service.list(request.query));
  app.get<{ Params: { id: string } }>('/:id', { schema: { params: PurchaseParamsSchema, response: { 200: PurchaseResponseSchema, ...errors } }, onRequest: access }, request => options.service.get(request.params.id));
  app.post<{ Params: { id: string }; Body: { expectedVersion: number } }>('/:id/validation', { schema: { params: PurchaseParamsSchema, body: PurchaseValidationSchema, response: { 200: PurchaseResponseSchema, ...errors } }, onRequest: write }, request => options.service.validate(request.params.id, request.body.expectedVersion, actors.get(request)!));
}
