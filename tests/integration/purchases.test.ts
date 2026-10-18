import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Value } from '@sinclair/typebox/value';
import { PurchaseResponseSchema, PurchaseListResponseSchema, PurchaseSummaryResponseSchema, PurchaseDeletionResponseSchema, headerFields, lineFields, administrativeFields } from '../../packages/contracts/src/purchases/index.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { purchaseDemoExamples, seedPurchaseDemo } from '../../db/seeds/purchases-demo.js';
import { AuthRepository } from '../../apps/api/src/modules/auth/repositories/auth.js';
import { AuthService } from '../../apps/api/src/modules/auth/services/auth.js';
import { CaptureReceipts } from '../../apps/api/src/modules/purchases/services/capture-receipts.js';
import { ExtractionService, httpExtractionProcessor } from '../../apps/api/src/modules/purchases/services/extractions.js';
import { createReviewDraft, validateExtractionResponse } from '../../packages/contracts/src/purchases/index.js';
import { extractionExamples } from '../../packages/contracts/src/purchases/examples.js';

const suffix = randomBytes(6).toString('hex');
const databases = [`cenit_purchase_test_${suffix}_empty`, `cenit_purchase_test_${suffix}_existing`];
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo'); url.username = 'cenit_admin'; url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString();
})();
const admin = createTestPool({ connectionString: adminUrl });
const pools: ReturnType<typeof createTestPool>[] = [];
const credentials = createDemoCredentials();
const cookies: Record<string, string> = {};
const origin = 'http://127.0.0.1:3000';
let app: ReturnType<typeof buildAcademicApp>, repository: PurchaseRepository;
const body = () => ({ ...structuredClone(manualPurchaseExample), operationId: randomUUID() });
const historical = body();
const historicalId = randomUUID();
let captureNow = Date.now();
const captureReceipts = new CaptureReceipts(randomBytes(32), () => captureNow);
// The pre-origin format is a fixed array serialization, independent of origin.
const historicalHash = createHash('sha256').update(JSON.stringify({ header: Object.keys(headerFields).map(key => historical.header[key as keyof typeof historical.header]), administrative: Object.keys(administrativeFields).map(key => historical.administrative[key as keyof typeof historical.administrative]), lines: historical.lines.map(line => Object.keys(lineFields).map(key => line[key as keyof typeof line])) })).digest('hex');
const request = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown, cookie = cookies.administrativo, suppliedOrigin: string | undefined = origin) => app.inject({ method, url, headers: { ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}) }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
beforeAll(async () => {
  process.env.APP_ENV = 'test';
  for (const [index, database] of databases.entries()) {
    await admin.query(`CREATE DATABASE ${database}`);
    const url = new URL(adminUrl); url.pathname = `/${database}`;
    const pool = createTestPool({ connectionString: url.toString() }); pools.push(pool);
    await pool.query('CREATE SCHEMA cenit');
    if (index === 1) {
      await pool.query('CREATE TABLE cenit.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)');
      for (const migration of readMigrationFiles({ migrationsFolder: 'db/migrations' }).slice(0, 5)) {
        for (const statement of migration.sql) if (statement.trim()) await pool.query(statement);
        await pool.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [migration.hash, migration.folderMillis]);
      }
      await prepareDemoAccounts(pool, credentials);
      const actor = (await pool.query("SELECT id FROM cenit.accounts WHERE role='administrativo'")).rows[0].id;
      const fields = [...Object.keys(headerFields), ...Object.keys(administrativeFields)];
      const values = [...Object.values(historical.header), ...Object.values(historical.administrative)];
      await pool.query(`INSERT INTO cenit.purchase_requests(id,operation_id,payload_hash,created_by,${fields.map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)).join(',')}) VALUES(${[historicalId, historical.operationId, historicalHash, actor, ...values].map((_, i) => `$${i + 1}`).join(',')})`, [historicalId, historical.operationId, historicalHash, actor, ...values]);
      const lineKeys = Object.keys(lineFields);
      for (const [index, line] of historical.lines.entries()) {
        const values = [randomUUID(), historicalId, index + 1, ...lineKeys.map(key => line[key as keyof typeof line])];
        await pool.query(`INSERT INTO cenit.purchase_request_lines(id,request_id,position,${lineKeys.map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)).join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')})`, values);
      }
    }
    const dir = resolve('tmp/purchase-tests', suffix); mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `migration-${index}`); writeFileSync(file, url.toString(), { mode: 0o600 });
    try { for (let run = 0; run < 2; run++) execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: file }, stdio: 'pipe' }); }
    finally { unlinkSync(file); }
  }
  repository = new PurchaseRepository(pools[0]!);
  app = buildAcademicApp({ captureReceipts, extraction: new ExtractionService(process.env.OCR_TEST_URL ? httpExtractionProcessor(process.env.OCR_TEST_URL) : async (image, name, mime) => { const result = structuredClone(extractionExamples[0]!.response); result.data.captureLayout = { status: 'compatible', signals: ['request_title', 'header_fields', 'line_section', 'eight_column_table'] }; result.data.input = { name, mimeType: mime as 'image/png', bytes: image.length, width: 1000, height: 700 }; return result; }, captureReceipts), repository: new AcademicRepository(pools[0]!), purchases: repository, auth: { service: new AuthService(new AuthRepository(pools[0]!)), config: { allowedOrigins: [origin], cookieSecure: false } } });
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
  await Promise.all(pools.map(closeTestPool));
  for (const database of databases) await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await closeTestPool(admin);
});

describe('solicitudes: PostgreSQL, API y revisión local', () => {
  it('migra vacío/existente, conserva cuentas anteriores y no carga compras ni semillas', async () => {
    for (const [index, pool] of pools.entries()) {
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.purchase_requests')).rows[0].n).toBe(index === 0 ? 0 : 1);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.accounts')).rows[0].n).toBe(index === 0 ? 0 : 3);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.__drizzle_migrations')).rows[0].n).toBe(readMigrationFiles({ migrationsFolder: 'db/migrations' }).length);
      if (index === 0) expect(await new PurchaseRepository(pool).summary()).toEqual({ data: { requests: 0, pending: 0, currency: 'CLP', pendingAmount: '0', days: [] } });
    }
    const previous = (await pools[1]!.query('SELECT source,example_id,payload_hash FROM cenit.purchase_requests WHERE id=$1', [historicalId])).rows[0];
    expect(previous).toEqual({ source: 'manual', example_id: null, payload_hash: historicalHash });
    const actor = (await pools[1]!.query("SELECT id FROM cenit.accounts WHERE role='administrativo'")).rows[0].id;
    const retry = await new PurchaseRepository(pools[1]!).create({ ...historical, origin: { type: 'manual' } }, actor);
    expect(retry.created).toBe(false); expect(retry.record.id).toBe(historicalId);
    expect(retry.record.header).toEqual(historical.header); expect(retry.record.lines).toEqual(historical.lines);
    expect((await pools[1]!.query('SELECT request_number_search,description_search FROM cenit.purchase_requests WHERE id=$1', [historicalId])).rows[0]).toEqual({ request_number_search: '000125', description_search: 'insumos de demostracion' });
    expect((await pools[1]!.query('SELECT provider_search FROM cenit.purchase_request_lines WHERE request_id=$1 ORDER BY position', [historicalId])).rows.map(row => row.provider_search)).toEqual(['proveedor ficticio a', 'proveedor ficticio b']);
    await prepareDemoAccounts(pools[0]!, credentials);
    for (const credential of credentials) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: credential.email, password: credential.password } });
      expect(response.statusCode).toBe(200); cookies[credential.role] = String(response.headers['set-cookie']).split(';')[0]!;
    }
  });
  it('sesión, roles y Origin se comprueban en todos los recursos', async () => {
    const routes: ['GET' | 'POST' | 'DELETE', string, unknown?][] = [['GET', '/api/v1/purchases?reviewStatus=pending'], ['GET', '/api/v1/purchases/summary'], ['DELETE', `/api/v1/purchases/${randomUUID()}`, { expectedVersion: 1 }], ['POST', '/api/v1/purchases', body()], ['GET', `/api/v1/purchases/${randomUUID()}`], ['POST', `/api/v1/purchases/${randomUUID()}/validation`, { expectedVersion: 1 }]];
    for (const [method, url, payload] of routes) {
      expect((await request(method, url, payload, '')).statusCode).toBe(401);
      for (const role of ['docente', 'estudiante']) expect((await request(method, url, payload, cookies[role])).statusCode).toBe(403);
    }
    expect((await request('POST', '/api/v1/purchases', body(), cookies.administrativo, 'http://invalid.example')).statusCode).toBe(403);
    for (const suppliedOrigin of ['', 'http://invalid.example']) expect((await request('DELETE', `/api/v1/purchases/${randomUUID()}`, { expectedVersion: 1 }, cookies.administrativo, suppliedOrigin)).statusCode).toBe(403);
  });
  it('guarda una solicitud y varios proveedores sin perder ceros, montos ni opcionales', async () => {
    const input = body(), response = await request('POST', '/api/v1/purchases', input);
    expect(response.statusCode).toBe(201); expect(Value.Check(PurchaseResponseSchema, response.json())).toBe(true);
    const saved = response.json().data;
    expect(saved.header).toEqual(input.header); expect(saved.lines).toEqual(input.lines); expect(saved.administrative).toEqual(input.administrative);
    expect(saved.reviewStatus).toBe('pending'); expect(saved.reviewedBy).toBeNull();
    expect((await request('GET', `/api/v1/purchases/${saved.id}`)).json().data).toEqual(saved);
    const freshRepository = new PurchaseRepository(pools[0]!); expect((await freshRepository.get(saved.id))!.lines).toEqual(input.lines);
  });
  it('reintentos concurrentes crean una sola solicitud y contenido distinto da conflicto', async () => {
    const input = body();
    const results = await Promise.all(Array.from({ length: 4 }, () => request('POST', '/api/v1/purchases', input)));
    expect(results.map(response => response.statusCode).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(results.map(response => response.json().data.id)).size).toBe(1);
    const altered = structuredClone(input); altered.header.description = 'Otro detalle';
    expect((await request('POST', '/api/v1/purchases', altered)).statusCode).toBe(409);
  });
  it('rollback no deja cabecera ni ítems parciales ante fallo de una línea', async () => {
    const actor = (await pools[0]!.query("SELECT id FROM cenit.accounts WHERE role='administrativo'")).rows[0].id;
    for (const origin of [{ type: 'manual' as const }, { type: 'contract_example' as const, exampleId: 'recovered' as const }]) {
      const input = { ...body(), origin }; input.lines[1]!.amount = '-1';
      await expect(repository.create(input, actor)).rejects.toThrow();
      expect((await pools[0]!.query('SELECT count(*)::int AS n FROM cenit.purchase_requests WHERE operation_id=$1', [input.operationId])).rows[0].n).toBe(0);
    }
  });
  it('ejemplos concurrentes conservan procedencia; cambiarla produce conflicto y la BD la protege', async () => {
    for (const exampleId of ['recovered', 'partial', 'ambiguous'] as const) {
      const input = { ...body(), origin: { type: 'contract_example' as const, exampleId } };
      const results = await Promise.all(Array.from({ length: 3 }, () => request('POST', '/api/v1/purchases', input)));
      expect(results.map(result => result.statusCode).sort()).toEqual([200, 200, 201]);
      const saved = results[0]!.json().data;
      expect(saved.source).toBe('contract_example'); expect(saved.exampleId).toBe(exampleId);
      expect(Value.Check(PurchaseResponseSchema, results[0]!.json())).toBe(true);
      expect((await request('POST', '/api/v1/purchases', { ...input, origin: { type: 'manual' } })).statusCode).toBe(409);
      const list = (await request('GET', '/api/v1/purchases?reviewStatus=pending&pageSize=100')).json();
      expect(list.data.find((row: { id: string }) => row.id === saved.id)).toMatchObject({ source: 'contract_example', exampleId });
      for (const [source, id] of [['manual', exampleId], ['contract_example', null], ['contract_example', 'failure'], ['ocr', null]]) {
        await expect(pools[0]!.query('UPDATE cenit.purchase_requests SET source=$2,example_id=$3 WHERE id=$1', [saved.id, source, id])).rejects.toMatchObject({ code: '23514' });
      }
    }
    const input = body(); expect((await request('POST', '/api/v1/purchases', input)).statusCode).toBe(201);
    expect((await request('POST', '/api/v1/purchases', { ...input, origin: { type: 'manual' } })).statusCode).toBe(200);
    expect((await request('POST', '/api/v1/purchases', { ...input, origin: { type: 'contract_example', exampleId: 'recovered' } })).statusCode).toBe(409);
    const example = { ...body(), origin: { type: 'contract_example' as const, exampleId: 'recovered' as const } };
    expect((await request('POST', '/api/v1/purchases', example)).statusCode).toBe(201);
    expect((await request('POST', '/api/v1/purchases', { ...example, origin: { type: 'contract_example', exampleId: 'partial' } })).statusCode).toBe(409);
  });
  it('la BD protege FKs, posición y coherencia de validación', async () => {
    const saved = (await request('POST', '/api/v1/purchases', body())).json().data;
    const pool = pools[0]!;
    await expect(pool.query('INSERT INTO cenit.purchase_request_lines(id,request_id,position) VALUES($1,$2,1)', [randomUUID(), randomUUID()])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query('INSERT INTO cenit.purchase_request_lines(id,request_id,position) VALUES($1,$2,1)', [randomUUID(), saved.id])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query('INSERT INTO cenit.purchase_request_lines(id,request_id,position) VALUES($1,$2,101)', [randomUUID(), saved.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE cenit.purchase_requests SET review_status='reviewed',reviewed_by=created_by WHERE id=$1", [saved.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('UPDATE cenit.purchase_requests SET total_amount=-1 WHERE id=$1', [saved.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE cenit.purchase_requests SET total_amount='NaN' WHERE id=$1", [saved.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE cenit.purchase_request_lines SET price='NaN' WHERE request_id=$1", [saved.id])).rejects.toMatchObject({ code: '23514' });
  });
  it('acepta mínimos sin ítems y montos de 255 dígitos, sin imponer suma', async () => {
    const input = body(); input.lines = []; input.header.totalAmount = '9'.repeat(255);
    const response = await request('POST', '/api/v1/purchases', input);
    expect(response.statusCode).toBe(201); expect(response.json().data.header.totalAmount).toBe(input.header.totalAmount);
  });
  it('validación concurrente/idempotente conserva al primer revisor y la versión', async () => {
    const saved = (await request('POST', '/api/v1/purchases', body())).json().data;
    expect((await request('POST', `/api/v1/purchases/${saved.id}/validation`, { expectedVersion: 2 })).statusCode).toBe(409);
    const results = await Promise.all(Array.from({ length: 3 }, () => request('POST', `/api/v1/purchases/${saved.id}/validation`, { expectedVersion: 1 })));
    for (const response of results) { expect(response.statusCode).toBe(200); expect(Value.Check(PurchaseResponseSchema, response.json())).toBe(true); }
    expect(results[0]!.json().data.version).toBe(2);
    expect(results.map(response => response.json().data.reviewedAt)).toEqual(Array(3).fill(results[0]!.json().data.reviewedAt));
    const list = await request('GET', '/api/v1/purchases?reviewStatus=reviewed&page=1&pageSize=20');
    expect(Value.Check(PurchaseListResponseSchema, list.json())).toBe(true); expect(list.json().data.some((record: { id: string }) => record.id === saved.id)).toBe(true);
  });
  it('paginación estable, filtros inválidos, inexistente y errores sin SQL', async () => {
    const list = await request('GET', '/api/v1/purchases?reviewStatus=pending&page=1&pageSize=1');
    expect(list.statusCode).toBe(200); expect(list.json().data).toHaveLength(1); expect(list.json().pagination.total).toBeGreaterThan(1);
    expect((await request('GET', '/api/v1/purchases?reviewStatus=paid')).statusCode).toBe(400);
    expect((await request('GET', '/api/v1/purchases?reviewStatus=pending&pageSize=101')).statusCode).toBe(400);
    expect((await request('GET', `/api/v1/purchases/${randomUUID()}`)).statusCode).toBe(404);
    const invalid = body(); invalid.header.sentDate = '2026-02-30';
    const response = await request('POST', '/api/v1/purchases', invalid);
    expect(response.statusCode).toBe(400); expect(response.body).not.toMatch(/SELECT|INSERT|stack|password_hash/); expect(response.json().error.requestId).toBeTruthy();
  });
  it('resumen persistente suma cabeceras una vez y refleja altas, revisión y eliminación con montos exactos', async () => {
    expect(await new PurchaseRepository(pools[1]!).summary()).toMatchObject({ data: { requests: 1, pending: 1, pendingAmount: historical.header.totalAmount } });
    const before = (await request('GET', '/api/v1/purchases/summary')).json().data;
    const input = body(); input.header.sentDate = '2098-01-02'; input.header.totalAmount = '9'.repeat(255);
    const saved = (await request('POST', '/api/v1/purchases', input)).json().data;
    const summary = await request('GET', '/api/v1/purchases/summary');
    expect(summary.statusCode).toBe(200); expect(Value.Check(PurchaseSummaryResponseSchema, summary.json())).toBe(true);
    expect(summary.headers['cache-control']).toBe('no-store');
    expect(summary.json().data).toMatchObject({ requests: before.requests + 1, pending: before.pending + 1, currency: 'CLP', pendingAmount: (BigInt(before.pendingAmount) + BigInt(input.header.totalAmount)).toString() });
    expect(summary.json().data.days.at(-1)).toEqual({ date: '2098-01-02', count: 1 });
    await request('POST', `/api/v1/purchases/${saved.id}/validation`, { expectedVersion: 1 });
    const reviewed = (await request('GET', '/api/v1/purchases/summary')).json().data;
    expect(reviewed).toMatchObject({ requests: before.requests + 1, pending: before.pending, pendingAmount: before.pendingAmount });
    expect(reviewed.days.at(-1)).toEqual({ date: '2098-01-02', count: 0 });
    expect((await request('DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: 2 })).statusCode).toBe(200);
    expect((await request('GET', '/api/v1/purchases/summary')).json().data).toEqual(before);
  });
  it('elimina pendientes y validados con sus ítems, exige versión y rechaza formatos inválidos', async () => {
    for (const reviewed of [false, true]) {
      const saved = (await request('POST', '/api/v1/purchases', body())).json().data;
      if (reviewed) await request('POST', `/api/v1/purchases/${saved.id}/validation`, { expectedVersion: 1 });
      const version = reviewed ? 2 : 1;
      for (const payload of [{}, { expectedVersion: 0 }, { expectedVersion: '1' }, { expectedVersion: version, role: 'administrativo' }]) {
        expect((await request('DELETE', `/api/v1/purchases/${saved.id}`, payload)).statusCode).toBe(400);
      }
      expect((await request('DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: reviewed ? 1 : 2 })).statusCode).toBe(409);
      expect((await repository.get(saved.id))!.lines).toEqual(saved.lines);
      const response = await request('DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: version });
      expect(response.statusCode).toBe(200); expect(Value.Check(PurchaseDeletionResponseSchema, response.json())).toBe(true);
      expect(response.json()).toEqual({ data: { id: saved.id } });
      expect((await request('GET', `/api/v1/purchases/${saved.id}`)).statusCode).toBe(404);
      expect((await pools[0]!.query('SELECT count(*)::int AS n FROM cenit.purchase_request_lines WHERE request_id=$1', [saved.id])).rows[0].n).toBe(0);
      expect((await request('DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: version })).statusCode).toBe(404);
    }
    expect((await request('DELETE', '/api/v1/purchases/invalid', { expectedVersion: 1 })).statusCode).toBe(400);
  });
  it('eliminación revierte ítems si falla la cabecera y serializa solicitudes concurrentes', async () => {
    const saved = (await request('POST', '/api/v1/purchases', body())).json().data;
    const client = await pools[0]!.connect();
    const proxy = { query: (sql: string, values?: unknown[]) => {
      if (sql.startsWith('DELETE FROM cenit.purchase_requests ')) throw new Error('failure-after-lines');
      return client.query(sql, values);
    }, release: () => client.release() } as unknown as PoolClient;
    const failing = new PurchaseRepository({ connect: async () => proxy } as unknown as Pool);
    await expect(failing.delete(saved.id, 1)).rejects.toThrow('failure-after-lines');
    expect(await repository.get(saved.id)).toEqual(saved);
    const responses = await Promise.all([request('DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: 1 }), request('DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: 1 })]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 404]);
    expect(await repository.get(saved.id)).toBeNull();
  });
  it('admite JSON grande sólo en alta y aplica límite combinado de 512 KiB', async () => {
    const input = body();
    input.lines = Array.from({ length: 100 }, () => ({ ...structuredClone(input.lines[0]!), description: 'x'.repeat(1000), provider: 'y'.repeat(255), costCenter: 'z'.repeat(255) }));
    expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(128 * 1024);
    expect((await request('POST', '/api/v1/purchases', input)).statusCode).toBe(201);
    input.operationId = randomUUID();
    for (const line of input.lines) for (const key of ['description', 'provider', 'costCenter', 'lineUnit', 'quantity', 'chargeAccount', 'universityCode', 'campusCode', 'unitCode', 'projectCode', 'accountingCode']) Object.assign(line, { [key]: '界'.repeat(key === 'description' ? 1000 : 255) });
    expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(512 * 1024);
    const response = await request('POST', '/api/v1/purchases', input);
    expect(response.statusCode).toBe(413); expect(response.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
  it('búsqueda literal ignora tildes/mayúsculas y preserva ceros y puntuación', async () => {
    const input = body(); input.header.requestNumber = 'SEARCH-00001'; input.header.description = 'Consulta Clínica 100%_\\ literal';
    input.lines[0]!.provider = 'Árbol Ñandú';
    const saved = (await request('POST', '/api/v1/purchases', input)).json().data;
    for (const q of ['SEARCH-00001', 'clinica', 'CLI\u0301NICA', 'arbol nandu', '%_\\', '   clinica   ']) {
      const result = await request('GET', `/api/v1/purchases?reviewStatus=pending&q=${encodeURIComponent(q)}`);
      expect(result.statusCode).toBe(200); expect(result.json().data.some((row: { id: string }) => row.id === saved.id)).toBe(true);
    }
    expect((await request('GET', '/api/v1/purchases?reviewStatus=pending&q=%25_%5C')).json().pagination.total).toBe(1);
    expect((await request('GET', `/api/v1/purchases?reviewStatus=pending&q=${encodeURIComponent("' OR 1=1 --")}`)).json().pagination.total).toBe(0);
    expect((await request('GET', `/api/v1/purchases/${saved.id}`)).json().data.header.description).toBe(input.header.description);
  });
  it('unidad y proyecto coinciden en el mismo ítem, sin duplicar cabeceras ni totales', async () => {
    const input = body(); input.header.description = 'FILTER-SAME-LINE'; input.header.sentDate = '2026-10-15'; input.header.totalAmount = '200000';
    input.lines[0]!.unitCode = '00A'; input.lines[0]!.projectCode = '00X';
    input.lines[1]!.unitCode = '00B'; input.lines[1]!.projectCode = '00Y';
    const saved = (await request('POST', '/api/v1/purchases', input)).json().data;
    const prefix = '/api/v1/purchases?reviewStatus=pending&q=FILTER-SAME-LINE';
    const absent = await request('GET', `${prefix}&unitCode=00A&projectCode=00Y`);
    expect(absent.json().pagination.total).toBe(0); expect(absent.json().totals.documentTotal).toBe('0');
    const found = await request('GET', `${prefix}&unitCode=00A&projectCode=00X&dateFrom=2026-10-15&dateTo=2026-10-15`);
    expect(found.json().data.map((row: { id: string }) => row.id)).toEqual([saved.id]); expect(found.json().totals.documentTotal).toBe('200000');
    expect((await request('GET', `${prefix}&unitCode=00A&projectCode=00X&dateTo=2026-10-14`)).json().pagination.total).toBe(0);
    expect((await request('GET', `${prefix}&projectCode=missing`)).json().pagination.total).toBe(0);
    input.operationId = randomUUID(); input.lines[1]!.unitCode = '00A'; input.lines[1]!.projectCode = '00X';
    const second = (await request('POST', '/api/v1/purchases', input)).json().data;
    const list = (await request('GET', `${prefix}&unitCode=00A&projectCode=00X&pageSize=1`)).json();
    expect(list.data).toHaveLength(1); expect(list.pagination.total).toBe(2); expect(list.totals.documentTotal).toBe('400000');
    expect(list.data[0].id).toBe([saved.id, second.id].sort().reverse()[0]);
    const outside = (await request('GET', `${prefix}&unitCode=00A&projectCode=00X&page=99`)).json();
    expect(outside.data).toEqual([]); expect(outside.pagination.total).toBe(2); expect(outside.totals.documentTotal).toBe('400000');
  });
  it('suma montos exactos de más de 255 dígitos y rechaza filtros sin consultar datos inválidos', async () => {
    for (let index = 0; index < 2; index++) { const input = body(); input.header.description = 'HUGE-FILTER'; input.header.totalAmount = '9'.repeat(255); expect((await request('POST', '/api/v1/purchases', input)).statusCode).toBe(201); }
    const result = await request('GET', '/api/v1/purchases?reviewStatus=pending&q=HUGE-FILTER&pageSize=1');
    expect(result.json().totals.documentTotal).toBe((2n * BigInt('9'.repeat(255))).toString());
    expect(Value.Check(PurchaseListResponseSchema, result.json())).toBe(true);
    for (const filter of ['q=', 'q=%20%20', 'dateFrom=2026-02-30', 'dateFrom=0000-01-01', 'dateFrom=2026-10-14&dateTo=2026-10-13', 'unitCode=', 'projectCode=' + 'x'.repeat(256), 'unknown=1', 'unitId=00000000-0000-4000-8000-000000000000']) {
      const response = await request('GET', '/api/v1/purchases?reviewStatus=pending&' + filter);
      expect(response.statusCode).toBe(400); expect(response.body).not.toMatch(/SELECT|stack|normalize_purchase_search/);
    }
  });
  it('conteo, monto y página conservan el mismo snapshot ante una escritura concurrente', async () => {
    const initial = body(); initial.header.description = 'SNAPSHOT-ONLY'; initial.header.totalAmount = '100';
    const saved = (await request('POST', '/api/v1/purchases', initial)).json().data;
    const actor = saved.createdBy.id;
    const client = await pools[0]!.connect(); let injected = false;
    const proxy = {
      query: async (sql: string, values?: unknown[]) => {
        const result = await client.query(sql, values);
        if (!injected && sql.startsWith('SELECT count(*)')) {
          injected = true; const later = body(); later.header.description = 'SNAPSHOT-ONLY'; later.header.totalAmount = '200';
          await repository.create(later, actor);
        }
        return result;
      }, release: () => client.release(),
    } as unknown as PoolClient;
    const reader = new PurchaseRepository({ connect: async () => proxy } as unknown as Pool);
    const response = await reader.list({ reviewStatus: 'pending', page: 1, pageSize: 20, q: 'SNAPSHOT-ONLY' });
    expect(injected).toBe(true); expect(response.pagination.total).toBe(1); expect(response.totals.documentTotal).toBe('100');
    expect(response.data.map(row => row.id)).toEqual([saved.id]);
    const current = await repository.list({ reviewStatus: 'pending', page: 1, pageSize: 20, q: 'SNAPSHOT-ONLY' });
    expect(current.pagination.total).toBe(2); expect(current.totals.documentTotal).toBe('300');
  });
  it('conserva el registro completo tras detener y arrancar un proceso real de API', async () => {
    const listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    const base = `http://127.0.0.1:${port}`;
    const url = new URL(adminUrl); url.pathname = `/${databases[0]}`;
    const file = resolve('tmp/purchase-tests', suffix, 'restart-url'); writeFileSync(file, url.toString(), { mode: 0o600 });
    let child: ChildProcess | undefined;
    const stop = async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()));
        child.kill('SIGTERM'); await exited;
      }
      child = undefined;
    };
    const start = async () => {
      child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], { env: { ...process.env, APP_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATABASE_URL_FILE: file, AUTH_COOKIE_SECURE: 'false', AUTH_ALLOWED_ORIGINS: base }, stdio: 'ignore' });
      for (let retry = 0; retry < 100; retry++) {
        if (child.exitCode !== null) throw new Error('El proceso API terminó antes de estar disponible.');
        try { if ((await fetch(`${base}/health/live`, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* bounded readiness polling */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('La API no respondió a tiempo.');
    };
    try {
      await start();
      const account = credentials.find(entry => entry.role === 'administrativo')!;
      const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
      const input = { ...body(), origin: { type: 'contract_example', exampleId: 'partial' } };
      const response = await fetch(`${base}/api/v1/purchases`, { method: 'POST', headers: { origin: base, cookie, 'content-type': 'application/json' }, body: JSON.stringify(input) });
      expect(response.status).toBe(201); const saved = (await response.json()).data;
      await stop(); await start();
      const read = await fetch(`${base}/api/v1/purchases/${saved.id}`, { headers: { cookie } });
      expect(read.status).toBe(200); expect((await read.json()).data).toEqual(saved);
      expect(saved.header).toEqual(input.header); expect(saved.lines).toEqual(input.lines);
      expect(saved.administrative).toEqual(input.administrative); expect(saved.exampleId).toBe('partial');
    } finally { await stop(); unlinkSync(file); }
  }, 30000);
  it('fallos inesperados no exponen SQL y logout impide consultas posteriores', async () => {
    const failed = buildAcademicApp({ repository: new AcademicRepository(pools[0]!), purchases: { get: async () => { throw new Error('SELECT password_hash FROM private_table: internal stack'); } } as unknown as PurchaseRepository, authenticate: async () => ({ accountId: randomUUID(), role: 'administrativo' }) });
    try {
      const response = await failed.inject({ url: `/api/v1/purchases/${randomUUID()}` });
      expect(response.statusCode).toBe(500); expect(response.body).not.toMatch(/SELECT|password_hash|stack|private_table/);
    } finally { await failed.close(); }
    expect((await request('POST', '/api/v1/auth/logout', {})).statusCode).toBe(204);
    expect((await request('GET', '/api/v1/purchases?reviewStatus=pending')).statusCode).toBe(401);
  });
});

describe('preparación explícita de compras ficticias', () => {
  it('rechaza producción y el CLI rechaza destinos distintos de la demo local', async () => {
    process.env.APP_ENV = 'production';
    try { await expect(seedPurchaseDemo(pools[0]!, credentials[0]!.id)).rejects.toThrow('demo/pruebas'); }
    finally { process.env.APP_ENV = 'test'; }
    for (const url of ['postgres://cenit_migrator@192.0.2.1/cenit_demo', 'postgres://cenit_app@127.0.0.1/cenit_demo', 'postgres://cenit_migrator@127.0.0.1/otra_base']) {
      expect(() => execFileSync(process.execPath, ['--import', 'tsx', 'db/seeds/purchases-demo.ts'], { env: { ...process.env, APP_ENV: 'demo', DATABASE_URL_FILE: '', DATABASE_URL: url }, stdio: 'pipe' })).toThrow();
    }
  });
  it('carga estados e ítems, conserva ceros/espacios y repetir no duplica ni revierte revisiones', async () => {
    const pool = pools[0]!, actor = credentials.find(account => account.role === 'administrativo')!.id;
    expect(await seedPurchaseDemo(pool, actor)).toEqual({ created: 8, retained: 0 });
    const pending = await repository.list({ reviewStatus: 'pending', page: 1, pageSize: 20, q: 'DEMO-COMPRA-' });
    const reviewed = await repository.list({ reviewStatus: 'reviewed', page: 1, pageSize: 20, q: 'DEMO-COMPRA-' });
    expect(pending.pagination.total).toBe(5); expect(reviewed.pagination.total).toBe(3);
    expect(pending.totals.documentTotal).toBe('1510000');
    for (const row of [...pending.data, ...reviewed.data]) {
      const record = (await repository.get(row.id))!, fixture = purchaseDemoExamples.find(example => example.input.header.requestNumber === row.requestNumber)!;
      expect(record.header).toEqual(fixture.input.header); expect(record.lines).toEqual(fixture.input.lines);
      expect(record.source).toBe('contract_example'); expect(record.exampleId).toBe('recovered');
    }
    const spaced = await repository.list({ reviewStatus: 'pending', page: 1, pageSize: 20, unitCode: '270101', projectCode: '0 0000000', q: 'DEMO-COMPRA-' });
    expect(spaced.pagination.total).toBe(1);
    const changed = await repository.validate(pending.data[0]!.id, 1, actor);
    const snapshots = await Promise.all([...pending.data, ...reviewed.data].map(row => repository.get(row.id)));
    expect(await seedPurchaseDemo(pool, actor)).toEqual({ created: 0, retained: 8 });
    expect(await Promise.all([...pending.data, ...reviewed.data].map(row => repository.get(row.id)))).toEqual(snapshots);
    expect(await repository.get(changed.id)).toEqual(changed);
  });
  it('rechaza cuentas ajenas al rol administrativo y contenido incompatible sin sobrescribirlo', async () => {
    const pool = pools[0]!, actor = credentials.find(account => account.role === 'administrativo')!.id;
    await expect(seedPurchaseDemo(pool, credentials.find(account => account.role === 'estudiante')!.id)).rejects.toThrow('cuenta administrativa');
    const fixture = purchaseDemoExamples[0]!.input;
    const saved = (await repository.create(fixture, actor)).record;
    await pool.query('UPDATE cenit.purchase_requests SET payload_hash=$2 WHERE id=$1', [saved.id, '0'.repeat(64)]);
    await expect(seedPurchaseDemo(pool, actor)).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect(await repository.get(saved.id)).toEqual(saved);
  });
});


describe('capture provenance and explicit persistence', () => {
  it('extracts without writes, persists reviewed values, verifies receipts and exact retries', async () => {
    captureNow = Date.now();
    const administrator = credentials.find(c => c.role === 'administrativo')!;
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: administrator.email, password: administrator.password } });
    expect(login.statusCode).toBe(200);
    cookies.administrativo = String(login.headers['set-cookie']).split(';')[0]!;
    const image = process.env.OCR_TEST_URL ? readFileSync('tmp/ocr-adapter-dev/fixtures/development-clear.png') : Buffer.from('fake');
    const payload = Buffer.concat([Buffer.from('--capture\r\nContent-Disposition: form-data; name="file"; filename="fictional.png"\r\nContent-Type: image/png\r\n\r\n'), image, Buffer.from('\r\n--capture--\r\n')]);
    const count = async () => (await pools[0]!.query('SELECT count(*)::int AS n FROM cenit.purchase_requests')).rows[0].n;
    const before = await count();
    const extraction = await app.inject({ method: 'POST', url: '/api/v1/purchases/extractions', headers: { cookie: cookies.administrativo, origin, 'content-type': 'multipart/form-data; boundary=capture' }, payload });
    expect(extraction.statusCode).toBe(200);
    captureNow = Date.now();
    const candidates = extraction.json();
    expect(validateExtractionResponse(candidates)).toEqual([]);
    expect(await count()).toBe(before);
    const draft = createReviewDraft(candidates);
    const input = { ...draft, header: { ...draft.header, requestNumber: '000901', sentDate: '2026-10-14', description: 'HUMAN REVIEWED FICTIONAL DATA', totalAmount: '71000' }, operationId: randomUUID(), origin: candidates.data.origin };
    const wrong = await request('POST', '/api/v1/purchases', { ...input, origin: { ...input.origin, extractionId: randomUUID() } });
    expect(wrong.statusCode).toBe(400); expect(await count()).toBe(before);
    const responses = await Promise.all([request('POST', '/api/v1/purchases', input), request('POST', '/api/v1/purchases', input)]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([200, 201]);
    const saved = responses[0]!.json().data;
    expect(saved.source).toBe('image_capture'); expect(saved.capture.extractionId).toBe(input.origin.extractionId);
    expect(saved.header.description).toBe(input.header.description);
    expect(saved).not.toHaveProperty('receipt');
    expect(await count()).toBe(before+1);
    expect((await request('POST', '/api/v1/purchases', { ...input, header: { ...input.header, totalAmount: '3' } })).statusCode).toBe(409);
    captureNow += 7200001;
    expect((await request('POST', '/api/v1/purchases', input)).statusCode).toBe(200);
    expect((await request('POST', '/api/v1/purchases', { ...input, operationId: randomUUID() })).statusCode).toBe(400);
    expect(await count()).toBe(before+1);
    const actor = credentials.find(c => c.role === 'administrativo')!.id;
    expect(() => captureReceipts.verify(input.origin, randomUUID(), true)).toThrow();
    expect(() => captureReceipts.verify(input.origin, actor, true)).not.toThrow();
    for (const sql of ["source='manual'", "example_id='recovered'", "extraction_id=NULL", "processor_version=NULL", "processed_at=NULL"]) {
      await expect(pools[0]!.query(`UPDATE cenit.purchase_requests SET ${sql} WHERE id=$1`, [saved.id])).rejects.toMatchObject({ code: '23514' });
    }
    captureNow = Date.now();
  }, 65000);
});
