import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import {
  AssetListQuerySchema, AssetListResponseSchema, AssetLocationSchema, AssetParamsSchema, AssetResponseSchema, AssetSummarySchema, CreateAssetSchema, CreateDeliverySchema,
  CreateLoanSchema, DeliveryListResponseSchema, DeliveryResponseSchema, DocumentListQuerySchema, LoanListResponseSchema, LoanResponseSchema, PeopleQuerySchema,
  PeopleResponseSchema, PersonInputSchema, PersonResponseSchema, PersonStatusSchema, ReturnLoanSchema, UpdateAssetSchema,
  type AssetListQuery, type AssetLocation, type CreateAsset, type CreateDelivery, type CreateLoan, type DocumentListQuery, type PeopleQuery, type PersonInput, type ReturnLoan, type UpdateAsset,
} from '@cenit/contracts/assets';
import type { Authenticate } from '../../auth/services/principal.js';
import { ApiError } from '../../../infrastructure/errors.js';
import type { AssetRepository } from '../repositories/assets.js';
import { altaPdf, deliveryPdf, loanPdf } from '../services/pdf.js';

// Bienes: sesión administrativa para leer; además Origin permitido para escribir y descargar documentos.
export async function assetRoutes(app: FastifyInstance, options: { repository: AssetRepository; authenticate: Authenticate; allowedOrigins: string[] }) {
  const { repository } = options;
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
  const actor = (request: FastifyRequest) => actors.get(request)!;
  const errors = Object.fromEntries([400, 401, 403, 404, 409, 413, 422, 500, 503].map(status => [status, ErrorResponseSchema]));
  const paged = (size = 20) => async (request: FastifyRequest) => {
    const query = request.query as Record<string, unknown>;
    query.page ??= 1; query.pageSize ??= size;
    if (typeof query.q === 'string') { query.q = query.q.trim(); if (!query.q) delete query.q; }
    for (const key of ['page', 'pageSize']) if (typeof query[key] === 'string' && /^[1-9][0-9]*$/.test(query[key])) query[key] = Number(query[key]);
  };
  const found = <T>(value: T | null, message: string) => { if (!value) throw new ApiError(404, 'NOT_FOUND', message); return value; };
  const pdf = (reply: FastifyReply, name: string, bytes: Uint8Array) => reply.header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="${name}.pdf"`).header('Cache-Control', 'no-store').send(Buffer.from(bytes));

  app.get('/summary', { onRequest: access, schema: { response: { 200: AssetSummarySchema, ...errors } } }, async () => ({ data: await repository.summary() }));
  app.get<{ Querystring: AssetListQuery }>('/', { onRequest: access, preValidation: paged(), schema: { querystring: AssetListQuerySchema, response: { 200: AssetListResponseSchema, ...errors } } },
    request => repository.list(request.query));
  app.post<{ Body: CreateAsset }>('/', { onRequest: write, schema: { body: CreateAssetSchema, response: { 200: AssetResponseSchema, 201: AssetResponseSchema, ...errors } } }, async (request, reply) => {
    const result = await repository.create(request.body, actor(request));
    return reply.code(result.created ? 201 : 200).send({ data: result.record });
  });

  app.get<{ Querystring: PeopleQuery }>('/people', { onRequest: access, preValidation: async request => { const q = request.query as Record<string, unknown>; if (typeof q.q === 'string') { q.q = q.q.trim(); if (!q.q) delete q.q; } },
    schema: { querystring: PeopleQuerySchema, response: { 200: PeopleResponseSchema, ...errors } } }, async request => ({ data: await repository.people(request.query) }));
  app.post<{ Body: PersonInput }>('/people', { onRequest: write, schema: { body: PersonInputSchema, response: { 201: PersonResponseSchema, ...errors } } },
    async (request, reply) => reply.code(201).send({ data: await repository.createPerson(request.body, actor(request)) }));
  app.post<{ Params: { id: string }; Body: { active: boolean } }>('/people/:id/status', { onRequest: write, schema: { params: AssetParamsSchema, body: PersonStatusSchema, response: { 200: PersonResponseSchema, ...errors } } },
    async request => ({ data: await repository.setPersonStatus(request.params.id, request.body.active) }));

  app.get<{ Querystring: DocumentListQuery }>('/deliveries', { onRequest: access, preValidation: paged(), schema: { querystring: DocumentListQuerySchema, response: { 200: DeliveryListResponseSchema, ...errors } } },
    request => repository.deliveries(request.query));
  app.post<{ Body: CreateDelivery }>('/deliveries', { onRequest: write, schema: { body: CreateDeliverySchema, response: { 200: DeliveryResponseSchema, 201: DeliveryResponseSchema, ...errors } } }, async (request, reply) => {
    const result = await repository.createDelivery(request.body, actor(request));
    return reply.code(result.created ? 201 : 200).send({ data: result.record });
  });
  app.get<{ Params: { id: string } }>('/deliveries/:id', { onRequest: access, schema: { params: AssetParamsSchema, response: { 200: DeliveryResponseSchema, ...errors } } },
    async request => ({ data: found(await repository.getDelivery(request.params.id), 'La entrega no existe.') }));
  app.get<{ Params: { id: string } }>('/deliveries/:id/pdf', { onRequest: access, schema: { params: AssetParamsSchema, response: errors } }, async (request, reply) => {
    const delivery = found(await repository.getDelivery(request.params.id), 'La entrega no existe.');
    return pdf(reply, `entrega-${delivery.number.replace('/', '-')}`, await deliveryPdf(delivery));
  });

  app.get<{ Querystring: DocumentListQuery }>('/loans', { onRequest: access, preValidation: paged(), schema: { querystring: DocumentListQuerySchema, response: { 200: LoanListResponseSchema, ...errors } } },
    request => repository.loans(request.query));
  app.post<{ Body: CreateLoan }>('/loans', { onRequest: write, schema: { body: CreateLoanSchema, response: { 200: LoanResponseSchema, 201: LoanResponseSchema, ...errors } } }, async (request, reply) => {
    const result = await repository.createLoan(request.body, actor(request));
    return reply.code(result.created ? 201 : 200).send({ data: result.record });
  });
  app.get<{ Params: { id: string } }>('/loans/:id', { onRequest: access, schema: { params: AssetParamsSchema, response: { 200: LoanResponseSchema, ...errors } } },
    async request => ({ data: found(await repository.getLoan(request.params.id), 'El préstamo no existe.') }));
  app.post<{ Params: { id: string }; Body: ReturnLoan }>('/loans/:id/return', { onRequest: write, schema: { params: AssetParamsSchema, body: ReturnLoanSchema, response: { 200: LoanResponseSchema, ...errors } } },
    async request => ({ data: await repository.returnLoan(request.params.id, request.body, actor(request)) }));
  app.get<{ Params: { id: string } }>('/loans/:id/pdf', { onRequest: access, schema: { params: AssetParamsSchema, response: errors } }, async (request, reply) => {
    const loan = found(await repository.getLoan(request.params.id), 'El préstamo no existe.');
    return pdf(reply, `prestamo-${loan.number.replace('/', '-')}`, await loanPdf(loan));
  });

  app.get<{ Params: { id: string } }>('/:id', { onRequest: access, schema: { params: AssetParamsSchema, response: { 200: AssetResponseSchema, ...errors } } },
    async request => ({ data: found(await repository.get(request.params.id), 'El bien no existe.') }));
  app.put<{ Params: { id: string }; Body: UpdateAsset }>('/:id', { onRequest: write, schema: { params: AssetParamsSchema, body: UpdateAssetSchema, response: { 200: AssetResponseSchema, ...errors } } },
    async request => ({ data: await repository.update(request.params.id, request.body, actor(request)) }));
  app.post<{ Params: { id: string }; Body: AssetLocation }>('/:id/location', { onRequest: write, schema: { params: AssetParamsSchema, body: AssetLocationSchema, response: { 200: AssetResponseSchema, ...errors } } },
    async request => ({ data: await repository.relocate(request.params.id, request.body, actor(request)) }));
  app.get<{ Params: { id: string } }>('/:id/alta.pdf', { onRequest: access, schema: { params: AssetParamsSchema, response: errors } }, async (request, reply) => {
    const asset = found(await repository.get(request.params.id), 'El bien no existe.');
    return pdf(reply, `alta-${asset.code}`, await altaPdf(asset));
  });
}
