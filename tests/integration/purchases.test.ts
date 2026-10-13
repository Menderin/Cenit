import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Value } from '@sinclair/typebox/value';
import { PurchaseResponseSchema, PurchaseListResponseSchema, headerFields, lineFields, administrativeFields } from '../../packages/contracts/src/purchases/index.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { AuthRepository } from '../../apps/api/src/modules/auth/repositories/auth.js';
import { AuthService } from '../../apps/api/src/modules/auth/services/auth.js';

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
// The pre-origin format is a fixed array serialization, independent of origin.
const historicalHash = createHash('sha256').update(JSON.stringify({ header: Object.keys(headerFields).map(key => historical.header[key as keyof typeof historical.header]), administrative: Object.keys(administrativeFields).map(key => historical.administrative[key as keyof typeof historical.administrative]), lines: historical.lines.map(line => Object.keys(lineFields).map(key => line[key as keyof typeof line])) })).digest('hex');
const request = (method: 'GET' | 'POST', url: string, payload?: unknown, cookie = cookies.administrativo, suppliedOrigin: string | undefined = origin) => app.inject({ method, url, headers: { ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}) }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
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
  app = buildAcademicApp({ repository: new AcademicRepository(pools[0]!), purchases: repository, auth: { service: new AuthService(new AuthRepository(pools[0]!)), config: { allowedOrigins: [origin], cookieSecure: false } } });
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
    const routes: ['GET' | 'POST', string, unknown?][] = [['GET', '/api/v1/purchases?reviewStatus=pending'], ['POST', '/api/v1/purchases', body()], ['GET', `/api/v1/purchases/${randomUUID()}`], ['POST', `/api/v1/purchases/${randomUUID()}/validation`, { expectedVersion: 1 }]];
    for (const [method, url, payload] of routes) {
      expect((await request(method, url, payload, '')).statusCode).toBe(401);
      for (const role of ['docente', 'estudiante']) expect((await request(method, url, payload, cookies[role])).statusCode).toBe(403);
    }
    expect((await request('POST', '/api/v1/purchases', body(), cookies.administrativo, 'http://invalid.example')).statusCode).toBe(403);
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
