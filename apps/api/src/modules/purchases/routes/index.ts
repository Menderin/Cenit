import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import { CreatePurchaseSchema, PurchaseListQuerySchema, PurchaseListResponseSchema, PurchaseParamsSchema, PurchaseResponseSchema, PurchaseValidationSchema, PurchaseDeletionSchema, PurchaseDeletionResponseSchema, PurchaseSummaryResponseSchema, PurchaseCapabilitiesResponseSchema, PurchaseSheetsQuerySchema, PurchaseSheetsResponseSchema, type PurchaseCapabilities, type CreatePurchase, type PurchaseListQuery } from '@cenit/contracts/purchases';
import type { Authenticate } from '../../auth/services/principal.js';
import { ApiError } from '../../../infrastructure/errors.js';
import type { PurchaseService } from '../services/purchases.js';
import multipart from '@fastify/multipart';
import { EXTRACTION_LIMITS, ExtractionResponseSchema } from '@cenit/contracts/purchases';
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
  app.get('/summary', { onRequest: access, schema: { response: { 200: PurchaseSummaryResponseSchema, ...errors } } }, () => options.service.summary());
  app.delete<{ Params: { id: string }; Body: { expectedVersion: number } }>('/:id', { onRequest: write,
    schema: { params: PurchaseParamsSchema, body: PurchaseDeletionSchema, response: { 200: PurchaseDeletionResponseSchema, ...errors } },
  }, request => options.service.delete(request.params.id, request.body.expectedVersion));
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
  app.get<{ Params: { id: string } }>('/:id', { schema: { params: PurchaseParamsSchema, response: { 200: PurchaseResponseSchema, ...errors } }, onRequest: access }, request => options.service.get(request.params.id));
  app.post<{ Params: { id: string }; Body: { expectedVersion: number } }>('/:id/validation', { schema: { params: PurchaseParamsSchema, body: PurchaseValidationSchema, response: { 200: PurchaseResponseSchema, ...errors } }, onRequest: write }, request => options.service.validate(request.params.id, request.body.expectedVersion, actors.get(request)!));
}
