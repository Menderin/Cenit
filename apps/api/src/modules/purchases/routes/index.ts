import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import { CreatePurchaseSchema, PurchaseListQuerySchema, PurchaseListResponseSchema, PurchaseParamsSchema, PurchaseResponseSchema, PurchasePaymentSchema, PurchaseDeletionSchema, PurchaseCatalogResponseSchema, PurchaseProvidersQuerySchema, PurchaseProvidersResponseSchema, PurchaseDeletionResponseSchema, PurchaseSummaryResponseSchema, PurchaseCapabilitiesResponseSchema, PurchaseSheetsQuerySchema, PurchaseSheetsResponseSchema, UpdatePurchaseSchema, type PurchaseCapabilities, type CreatePurchase, type PurchaseListQuery, type PurchasePayment, type UpdatePurchase } from '@cenit/contracts/purchases';
import type { Authenticate } from '../../auth/services/principal.js';
import { ApiError } from '../../../infrastructure/errors.js';
import type { PurchaseService } from '../services/purchases.js';
import multipart from '@fastify/multipart';
import { EXTRACTION_LIMITS, ExtractionResponseSchema, PurchaseProjectParamsSchema, PurchaseProjectSummaryResponseSchema, PurchaseProjectsResponseSchema, PurchaseYearQuerySchema, type PurchaseYearQuery } from '@cenit/contracts/purchases';
import type { PurchaseSheetsRepository } from '../repositories/sheets.js';
import { ExtractionService } from '../services/extractions.js';

export async function purchaseRoutes(app: FastifyInstance, options: { service: PurchaseService; authenticate: Authenticate; allowedOrigins: string[]; capabilities: PurchaseCapabilities; sheets?: { repository: PurchaseSheetsRepository; spreadsheetId: string }; extraction?: ExtractionService }) {
  await app.register(multipart, { limits: { fileSize: EXTRACTION_LIMITS.maxBytes, files: 1, fields: 0, parts: 1, headerPairs: 30 } });
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
  app.get('/capabilities', { onRequest: access, schema: { response: { 200: PurchaseCapabilitiesResponseSchema, ...errors } } }, () => ({ data: options.capabilities }));
  app.get<{ Querystring: { purchaseId?: string } }>('/sheets-sync', { onRequest: access,
    schema: { querystring: PurchaseSheetsQuerySchema, response: { 200: PurchaseSheetsResponseSchema, ...errors } },
  }, async request => {
    if (!options.capabilities.sheetsSyncEnabled) return { data: { status: 'disabled', pending: 0, lastSyncedAt: null, url: null } };
    if (!options.sheets) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'La sincronización no está disponible.');
    if (request.query.purchaseId) await options.service.get(request.query.purchaseId);
    return options.sheets.repository.status(options.sheets.spreadsheetId, request.query.purchaseId);
  });
  app.get<{ Querystring: PurchaseYearQuery }>('/summary', { onRequest: access, schema: { querystring: PurchaseYearQuerySchema, response: { 200: PurchaseSummaryResponseSchema, ...errors } } },
    request => options.service.summary(request.query.year));
  app.get<{ Querystring: PurchaseYearQuery }>('/projects', { onRequest: access, schema: { querystring: PurchaseYearQuerySchema, response: { 200: PurchaseProjectsResponseSchema, ...errors } } },
    request => options.service.projects(request.query.year));
  app.get<{ Params: { code: string }; Querystring: PurchaseYearQuery }>('/projects/:code', { onRequest: access,
    schema: { params: PurchaseProjectParamsSchema, querystring: PurchaseYearQuerySchema, response: { 200: PurchaseProjectSummaryResponseSchema, ...errors } },
  }, request => options.service.project(request.params.code, request.query.year));
  app.get('/catalog', { onRequest: access, schema: { response: { 200: PurchaseCatalogResponseSchema, ...errors } } }, () => options.service.catalog());
  app.get<{ Querystring: { q: string } }>('/providers', { onRequest: access, schema: { querystring: PurchaseProvidersQuerySchema, response: { 200: PurchaseProvidersResponseSchema, ...errors } } },
    request => options.service.providers(request.query.q));
  app.post<{ Params: { id: string }; Body: PurchasePayment }>('/:id/payment-situation', { onRequest: write,
    schema: { params: PurchaseParamsSchema, body: PurchasePaymentSchema, response: { 200: PurchaseResponseSchema, ...errors } },
  }, request => options.service.setPaymentSituation(request.params.id, request.body));
  app.delete<{ Params: { id: string }; Body: { expectedVersion: number } }>('/:id', { onRequest: write,
    schema: { params: PurchaseParamsSchema, body: PurchaseDeletionSchema, response: { 200: PurchaseDeletionResponseSchema, ...errors } },
  }, request => options.service.delete(request.params.id, request.body.expectedVersion));
  app.put<{ Params: { id: string }; Body: UpdatePurchase }>('/:id', { bodyLimit: 512 * 1024, onRequest: write,
    schema: { params: PurchaseParamsSchema, body: UpdatePurchaseSchema, response: { 200: PurchaseResponseSchema, ...errors } },
  }, request => options.service.update(request.params.id, request.body));
  app.post('/extractions', { onRequest: write, schema: { response: { 200: ExtractionResponseSchema, ...errors, 415: ErrorResponseSchema, 422: ErrorResponseSchema } } }, async (request, reply) => {
    if (!request.isMultipart()) throw new ApiError(400, 'VALIDATION_ERROR', 'Envía un único archivo PNG/JPEG en el campo file.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    const closed = () => { if (!reply.raw.writableEnded) abort(); };
    request.raw.once('aborted', abort); reply.raw.once('close', closed);
    let image: Buffer | undefined; let name = ''; let mime = '';
    try {
      for await (const part of request.parts()) {
        if (part.type !== 'file' || part.fieldname !== 'file' || image) throw new ApiError(400, 'VALIDATION_ERROR', 'Sólo se admite un archivo en el campo file.');
        name = part.filename; mime = part.mimetype;
        if (!name || name.length > 255) throw new ApiError(400, 'VALIDATION_ERROR', 'Nombre de archivo inválido.');
        if (!['image/png', 'image/jpeg'].includes(mime)) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Sólo se admite PNG/JPEG.');
        image = await part.toBuffer();
      }
      if (!image?.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Selecciona un archivo PNG/JPEG.');
      return await (options.extraction ?? new ExtractionService()).extract(image, name, mime, actors.get(request)!, controller.signal);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'El archivo supera 5 MiB.');
      if (code && ['FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT'].includes(code)) throw new ApiError(400, 'VALIDATION_ERROR', 'Sólo se admite un archivo, sin campos adicionales.');
      if (!(error instanceof ApiError)) throw new ApiError(400, 'VALIDATION_ERROR', 'Entrada multipart inválida.');
      throw error;
    } finally {
      image?.fill(0); request.raw.off('aborted', abort); reply.raw.off('close', closed);
    }
  });
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
  app.get<{ Querystring: PurchaseListQuery }>('/export.xlsx', { schema: { querystring: PurchaseListQuerySchema, response: errors }, onRequest: access,
    preValidation: async request => {
      const query = request.query as unknown as Record<string, unknown>;
      query.page ??= 1; query.pageSize ??= 100;
      if (typeof query.q === 'string') query.q = query.q.trim();
      for (const key of ['page', 'pageSize']) if (typeof query[key] === 'string' && /^[1-9][0-9]*$/.test(query[key])) query[key] = Number(query[key]);
    },
  }, async (request, reply) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const detach = () => { request.raw.off('aborted', cancel); reply.raw.off('close', cancel); };
    request.raw.once('aborted', cancel);
    reply.raw.once('close', cancel);
    let file;
    try { file = await options.service.export(request.query, controller.signal); }
    catch (error) { detach(); throw error; }
    file.stream.once('close', () => {
      detach();
      void file.cleanup().catch(error => request.log.error({ err: error }, 'No se pudo retirar el archivo temporal de exportación.'));
    });
    return reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="compras.xlsx"')
      .header('Cache-Control', 'no-store')
      .send(file.stream);
  });
  app.get<{ Params: { id: string } }>('/:id', { schema: { params: PurchaseParamsSchema, response: { 200: PurchaseResponseSchema, ...errors } }, onRequest: access }, request => options.service.get(request.params.id));
}
