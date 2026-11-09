import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { CaptureOriginSchema, CreatePurchaseSchema, validateExtractionResponse } from '@cenit/contracts/purchases';
import { extractionExamples } from '../../../../../../packages/contracts/src/purchases/examples.js';
import { manualPurchaseExample } from '../../../../../../packages/contracts/src/purchases/record-examples.js';
import { CaptureReceipts } from './capture-receipts.js';
import { ExtractionService, httpExtractionProcessor, type ExtractionProcessor } from './extractions.js';
import { purchaseRoutes } from '../routes/index.js';
import type { PurchaseService } from './purchases.js';
import { ApiError } from '../../../infrastructure/errors.js';

const account = randomUUID();
const metadata = { type: 'image_capture' as const, extractionId: randomUUID(), processorVersion: 'tesseract5-spa-grid8-layout-v1', processedAt: new Date(1000).toISOString() };
const success: ExtractionProcessor = async (image, name, mime) => {
  const result = structuredClone(extractionExamples[0]!.response); result.data.captureLayout = { status: 'compatible', signals: ['request_title', 'header_fields', 'line_section', 'eight_column_table'] };
  result.data.input = { name, mimeType: mime as 'image/png', bytes: image.length, width: 1200, height: 900 };
  return result;
};
describe('capture receipt', () => {
  it('binds metadata and account; rejects tampering, future, expiry and short key', () => {
    const now = 2000; const receipts = new CaptureReceipts(randomBytes(32), () => now);
    const origin = receipts.issue(metadata, account);
    expect(Value.Check(CaptureOriginSchema, origin)).toBe(true);
    expect(Value.Check(CreatePurchaseSchema, { ...manualPurchaseExample, operationId: randomUUID(), origin })).toBe(true);
    expect(() => receipts.verify(origin, account)).not.toThrow();
    for (const invalid of [{ ...origin, extractionId: randomUUID() }, { ...origin, processorVersion: 'other' }, { ...origin, processedAt: new Date(3000).toISOString() }]) expect(() => receipts.verify(invalid, account)).toThrow();
    expect(() => receipts.verify(origin, randomUUID())).toThrow();
    const later = new CaptureReceipts(randomBytes(32));
    expect(() => later.verify(origin, account)).toThrow();
    const key = randomBytes(32); const expired = new CaptureReceipts(key, () => 1000+7200000);
    const token = expired.issue(metadata, account);
    expect(() => expired.verify(token, account)).toThrow();
    expect(() => expired.verify(token, account, true)).not.toThrow();
    expect(() => new CaptureReceipts(Buffer.alloc(4))).toThrow();
  });
});
describe('extraction service', () => {
  const receipts = new CaptureReceipts(randomBytes(32));
  it('reports an unavailable HTTP worker without blaming the image', async () => {
    const worker = Fastify();
    worker.post('/extract', (_request, reply) => reply.code(503).send({ code: 'EXTRACTION_UNAVAILABLE' }));
    worker.addContentTypeParser('image/png', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    const url = await worker.listen({ host: '127.0.0.1', port: 0 });
    try {
      await expect(httpExtractionProcessor(url)(Buffer.from('fake'), 'fake.png', 'image/png', new AbortController().signal))
        .rejects.toMatchObject({ status: 503, code: 'EXTRACTION_UNAVAILABLE', message: 'El procesador está ocupado o no está disponible. Reintenta en unos instantes.' });
    } finally { await worker.close(); }
  });
  it('validates output and emits verifiable provenance without persistence', async () => {
    const result = await new ExtractionService(success, receipts).extract(Buffer.from('test'), 'fake.png', 'image/png', account, new AbortController().signal);
    expect(validateExtractionResponse(result)).toEqual([]);
    expect(result.data.origin?.processorVersion).toBe('tesseract5-spa-grid8-layout-v1');
    expect(() => receipts.verify(result.data.origin!, account)).not.toThrow();
  });
  it('rejects unavailable, invalid output and processor errors', async () => {
    for (const service of [new ExtractionService(), new ExtractionService(async () => ({}), receipts), new ExtractionService(async () => { throw new Error('internal SQL'); }, receipts)]) {
      await expect(service.extract(Buffer.from('test'), 'fake.png', 'image/png', account, new AbortController().signal)).rejects.toMatchObject({ status: 503, code: 'EXTRACTION_UNAVAILABLE' });
    }
  });
  it('passes bounded cancellation and rejects concurrent inference without queueing', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const service = new ExtractionService(async (...args) => { expect(args[3]).toBeInstanceOf(AbortSignal); await gate; return success(...args); }, receipts);
    const first = service.extract(Buffer.from('test'), 'fake.png', 'image/png', account, new AbortController().signal);
    await expect(service.extract(Buffer.from('test'), 'fake.png', 'image/png', account, new AbortController().signal)).rejects.toMatchObject({ status: 503 });
    release(); await first;
  });
  it('maps a controlled timeout and cancellation to unavailable, and releases its slot', async () => {
    const processor: ExtractionProcessor = async (_image, _name, _mime, signal) => new Promise((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const service = new ExtractionService(processor, receipts, 10);
    for (let i = 0; i < 2; i++) await expect(service.extract(Buffer.from('test'), 'fake.png', 'image/png', account, new AbortController().signal)).rejects.toMatchObject({ status: 503 });
    const controller = new AbortController(); controller.abort();
    await expect(service.extract(Buffer.from('test'), 'fake.png', 'image/png', account, controller.signal)).rejects.toMatchObject({ status: 503 });
  });
});

function multipart(file: Buffer, extra = '', field = 'file', mime = 'image/png') {
  return Buffer.concat([Buffer.from(`--boundary\r\nContent-Disposition: form-data; name="${field}"; filename="fake.png"\r\nContent-Type: ${mime}\r\n\r\n`), file, Buffer.from(`\r\n${extra}--boundary--\r\n`)]);
}
async function app() {
  const server = Fastify();
  server.setErrorHandler((error, request, reply) => {
    const e = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'Error');
    reply.code(e.status).send({ error: { code: e.code, message: e.message, requestId: request.id } });
  });
  await server.register(purchaseRoutes, { capabilities: { secondReviewEnabled: false, sheetsSyncEnabled: false }, prefix: '/api/v1/purchases', service: {} as PurchaseService,
    authenticate: async request => request.headers['x-test-role'] ? { accountId: account, role: request.headers['x-test-role'] as 'administrativo' } : null,
    allowedOrigins: ['http://localhost:5173'], extraction: new ExtractionService(success, new CaptureReceipts(randomBytes(32))) });
  return server;
}
describe('extraction HTTP route', () => {
  it.each([['', 401], ['docente', 403], ['estudiante', 403], ['administrativo', 200]])('checks role %s before inference', async (role, status) => {
    const server = await app();
    try {
      const response = await server.inject({ method: 'POST', url: '/api/v1/purchases/extractions', headers: { 'x-test-role': role, origin: 'http://localhost:5173', 'content-type': 'multipart/form-data; boundary=boundary' }, payload: multipart(Buffer.from('test')) });
      expect(response.statusCode).toBe(status);
    } finally { await server.close(); }
  });
  it('rejects missing Origin, extra fields/files, wrong MIME and oversized uploads', async () => {
    const server = await app();
    try {
      const send = (payload: Buffer, origin = 'http://localhost:5173') => server.inject({ method: 'POST', url: '/api/v1/purchases/extractions', headers: { 'x-test-role': 'administrativo', origin, 'content-type': 'multipart/form-data; boundary=boundary' }, payload });
      expect((await send(multipart(Buffer.from('test')), '')).statusCode).toBe(403);
      expect((await send(multipart(Buffer.from('test'), '', 'other'))).statusCode).toBe(400);
      expect((await send(multipart(Buffer.from('test'), '--boundary\r\nContent-Disposition: form-data; name="extra"\r\n\r\nx\r\n'))).statusCode).toBe(400);
      expect((await send(multipart(Buffer.from('test'), '--boundary\r\nContent-Disposition: form-data; name="file"; filename="b.png"\r\nContent-Type: image/png\r\n\r\nx\r\n'))).statusCode).toBe(400);
      expect((await send(multipart(Buffer.from('test'), '', 'file', 'application/pdf'))).statusCode).toBe(415);
      expect((await send(multipart(Buffer.alloc(5*1024*1024+1)))).statusCode).toBe(413);
    } finally { await server.close(); }
  });
});
