// HU07-T04 — Verificación del detalle de compras contra el servidor compilado.
// Proceso real `apps/api/dist/server.js` (requiere `npm run build`), HTTP real y rol PostgreSQL de runtime sin DDL.
// Cada respuesta válida se coteja campo a campo con SQL directo; los rechazos no deben contener datos de la compra.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { Value } from '@sinclair/typebox/value';
import { PurchaseResponseSchema, headerFields, lineFields, administrativeFields, type CreatePurchase } from '../../packages/contracts/src/purchases/index.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { createTestPool, closeTestPool } from './support/postgres.js';

const suffix = randomBytes(6).toString('hex');
const database = `cenit_hu07_${suffix}`;
const runtimeRole = `cenit_hu07_app_${suffix}`;
const runtimePassword = randomBytes(24).toString('hex');
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo'); url.username = 'cenit_admin'; url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString();
})();
const admin = createTestPool({ connectionString: adminUrl });
let db: Pool;
const dir = resolve('tmp/purchase-hu07-tests', suffix);
const migratorFile = resolve(dir, 'migrator-url'), runtimeFile = resolve(dir, 'runtime-url');
const credentials = createDemoCredentials();
const cookies: Record<string, string> = {};
let base = '', child: ChildProcess | undefined, stderr = '';
const column = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

const freePort = async () => {
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, '127.0.0.1', done));
  const value = (listener.address() as { port: number }).port;
  await new Promise<void>((done, fail) => listener.close(error => error ? fail(error) : done()));
  return value;
};
const startApi = async (port: number) => {
  child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'production', APP_ENV: 'demo', HOST: '127.0.0.1', PORT: String(port), DATABASE_URL_FILE: runtimeFile, AUTH_COOKIE_SECURE: 'false', AUTH_ALLOWED_ORIGINS: base },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr!.on('data', chunk => { stderr += String(chunk); });
  for (let retry = 0; retry < 150; retry++) {
    if (child.exitCode !== null) throw new Error(`La API terminó antes de estar disponible: ${stderr}`);
    try { if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* sondeo acotado */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('La API no quedó lista a tiempo.');
};
const login = async (role: string) => {
  const account = credentials.find(entry => entry.role === role)!;
  const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
};
const detail = (id: string, cookie: string | undefined = cookies.administrativo, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1/purchases/${id}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
const create = async (input: CreatePurchase) => {
  const response = await fetch(`${base}/api/v1/purchases`, { method: 'POST', headers: { origin: base, cookie: cookies.administrativo!, 'content-type': 'application/json' }, body: JSON.stringify(input) });
  expect(response.status).toBe(201);
  return (await response.json()).data;
};

/** Registro con todos los campos informados, para detectar cualquier campo omitido o cruzado. */
const fullRecord = (): CreatePurchase => {
  const tag = randomBytes(4).toString('hex'); // valores únicos por registro: un cruce entre solicitudes no puede pasar desapercibido
  const header = Object.fromEntries(Object.keys(headerFields).map(key => [key, `H-${key}-${tag}`])) as Record<string, string>;
  Object.assign(header, { requestNumber: `0042-${tag}`, sentDate: '2026-10-13', sentTime: '08:05:09', totalAmount: '1234567890123456789012345', taxAmount: '0' });
  const lines = [1, 2, 3].map(index => {
    const line = Object.fromEntries(Object.keys(lineFields).map(key => [key, `${tag}-L${index}-${key}`])) as Record<string, string>;
    return Object.assign(line, { price: String(index * 1000), amount: String(index * 1000), projectCode: `000${index}`, quantity: `${index},5` });
  });
  const administrative = Object.fromEntries(Object.keys(administrativeFields).map(key => [key, `A-${key}-${tag}`])) as Record<string, string>;
  administrative.paymentSituation = 'Pago declarado ficticio';
  return { operationId: randomUUID(), header, lines, administrative } as unknown as CreatePurchase;
};
/** Lectura independiente con SQL, convertida al formato del contrato. */
const fromDatabase = async (id: string) => {
  const header = (await db.query(`SELECT *, sent_date::text AS sent_date_text, total_amount::text AS total_text, tax_amount::text AS tax_text FROM cenit.purchase_requests WHERE id=$1`, [id])).rows[0];
  const lines = (await db.query('SELECT *, price::text AS price_text, amount::text AS amount_text FROM cenit.purchase_request_lines WHERE request_id=$1 ORDER BY position', [id])).rows;
  return {
    header: Object.fromEntries(Object.keys(headerFields).map(key => [key, key === 'sentDate' ? header.sent_date_text : key === 'totalAmount' ? header.total_text : key === 'taxAmount' ? header.tax_text : header[column(key)]])),
    lines: lines.map(line => Object.fromEntries(Object.keys(lineFields).map(key => [key, key === 'price' ? line.price_text : key === 'amount' ? line.amount_text : line[column(key)]]))),
    administrative: Object.fromEntries(Object.keys(administrativeFields).map(key => [key, header[column(key)]])),
    reviewStatus: header.review_status, version: header.version, source: header.source, exampleId: header.example_id,
  };
};
/** Un rechazo no puede filtrar ningún valor del registro. */
const leaks = (body: string, record: { header: Record<string, unknown>; lines: Record<string, unknown>[] }) =>
  [record.header.requestNumber, record.header.description, record.header.totalAmount, ...record.lines.map(line => line.provider)].filter(value => typeof value === 'string' && body.includes(value));

beforeAll(async () => {
  process.env.APP_ENV = 'test';
  mkdirSync(dir, { recursive: true });
  await admin.query(`CREATE DATABASE ${database}`);
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  db = createTestPool({ connectionString: url.toString() });
  await db.query('CREATE SCHEMA cenit');
  writeFileSync(migratorFile, url.toString(), { mode: 0o600 });
  execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: migratorFile }, stdio: 'pipe' });
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await db.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE ${database} TO ${runtimeRole}; GRANT USAGE ON SCHEMA cenit TO ${runtimeRole};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cenit TO ${runtimeRole}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cenit TO ${runtimeRole};`);
  const runtimeUrl = new URL(url.toString()); runtimeUrl.username = runtimeRole; runtimeUrl.password = runtimePassword;
  writeFileSync(runtimeFile, runtimeUrl.toString(), { mode: 0o600 });
  await prepareDemoAccounts(db, credentials);
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  await startApi(port);
  for (const role of ['administrativo', 'docente', 'estudiante']) cookies[role] = await login(role);
});

afterAll(async () => {
  if (child && child.exitCode === null) { const exited = new Promise(done => child!.once('exit', done)); child.kill('SIGTERM'); await exited; }
  if (db) await closeTestPool(db);
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
  await closeTestPool(admin);
  rmSync(dir, { recursive: true, force: true });
});

describe('HU07-T04: registro válido', () => {
  it('devuelve exactamente lo persistido: cada campo de cabecera, ítem y seguimiento, en orden', async () => {
    const input = fullRecord(), saved = await create(input);
    const response = await detail(saved.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(Value.Check(PurchaseResponseSchema, body)).toBe(true);
    const record = body.data, stored = await fromDatabase(saved.id);
    expect(record.header).toEqual(stored.header); expect(record.lines).toEqual(stored.lines); expect(record.administrative).toEqual(stored.administrative);
    expect(record.header).toEqual(input.header); expect(record.lines).toEqual(input.lines); expect(record.administrative).toEqual(input.administrative);
    expect(record.lines.map((line: { projectCode: string }) => line.projectCode)).toEqual(['0001', '0002', '0003']);
    expect(record.header.totalAmount).toBe('1234567890123456789012345'); // más allá de Number.MAX_SAFE_INTEGER
    expect({ reviewStatus: record.reviewStatus, version: record.version, source: record.source, exampleId: record.exampleId })
      .toEqual({ reviewStatus: stored.reviewStatus, version: stored.version, source: 'manual', exampleId: null });
    expect(record.reviewedBy).toBeNull(); expect(record.reviewedAt).toBeNull();
    expect(record.createdBy.name).toBe(credentials.find(entry => entry.role === 'administrativo')!.name);
    expect(JSON.stringify(body)).not.toMatch(/payload_hash|payloadHash|operation_?[iI]d|password|token/);
  });
  it('cada identificador devuelve su propio registro (sin cruces entre solicitudes)', async () => {
    const records = await Promise.all([fullRecord(), fullRecord(), fullRecord()].map((input, index) => { input.header.description = `Solicitud ${index}`; return create(input); }));
    for (const [index, saved] of records.entries()) {
      const record = (await (await detail(saved.id)).json()).data, stored = await fromDatabase(saved.id);
      expect(record.id).toBe(saved.id); expect(record.header.description).toBe(`Solicitud ${index}`);
      expect(record.lines).toEqual(stored.lines); expect(record.lines).toEqual(saved.lines); expect(record.administrative).toEqual(saved.administrative);
    }
  });
  it('procedencia de ejemplo y revisión local se reflejan tras validar; pago declarado sigue separado', async () => {
    const input = { ...fullRecord(), origin: { type: 'contract_example' as const, exampleId: 'ambiguous' as const } };
    const saved = await create(input);
    // Usa la versión que devolvió el servidor, no un valor fijo; si falla, el mensaje incluye el código de error de la API.
    const validated = await fetch(`${base}/api/v1/purchases/${saved.id}/validation`, { method: 'POST', headers: { origin: base, cookie: cookies.administrativo!, 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: saved.version }) });
    const validationBody = await validated.text();
    expect(validated.status, `validación respondió: ${validationBody}`).toBe(200);
    const record = (await (await detail(saved.id)).json()).data;
    expect({ source: record.source, exampleId: record.exampleId, reviewStatus: record.reviewStatus, version: record.version }).toEqual({ source: 'contract_example', exampleId: 'ambiguous', reviewStatus: 'reviewed', version: saved.version + 1 });
    expect(record.reviewedBy.name).toBe(credentials.find(entry => entry.role === 'administrativo')!.name);
    expect(record.administrative.paymentSituation).toBe('Pago declarado ficticio'); // la revisión no altera el pago
    expect(record).not.toHaveProperty('approval'); expect(record).not.toHaveProperty('oracleApproval');
  });
  it('registro mínimo sin ítems ni opcionales devuelve null explícito, no valores inventados', async () => {
    const input = fullRecord();
    for (const key of Object.keys(input.header)) if (!['requestNumber', 'sentDate', 'description', 'totalAmount'].includes(key)) (input.header as Record<string, unknown>)[key] = null;
    for (const key of Object.keys(input.administrative)) (input.administrative as Record<string, unknown>)[key] = null;
    input.lines = [];
    const record = (await (await detail((await create(input)).id)).json()).data;
    expect(record.lines).toEqual([]); expect(record.header.oracleId).toBeNull(); expect(Object.values(record.administrative).every(value => value === null)).toBe(true);
  });
});

describe('HU07-T04: inexistente e identificadores inválidos', () => {
  it('UUID inexistente → 404 comprensible con requestId', async () => {
    const response = await detail(randomUUID());
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Solicitud inexistente.' });
    expect(typeof body.error.requestId).toBe('string');
  });
  it.each([
    ['texto', 'abc'], ['UUID en mayúsculas', randomUUID().toUpperCase()], ['UUID truncado', randomUUID().slice(0, 35)],
    ['inyección SQL', encodeURIComponent("' OR '1'='1")], ['comodín LIKE', '%25'], ['número', '1'],
  ])('identificador %s → 400, nunca 500 ni datos', async (_name, id) => {
    const response = await detail(id);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toMatch(/SELECT|purchase_request|stack|syntax/i);
  });
});

describe('HU07-T04: fallo de consulta', () => {
  it('fallo de PostgreSQL → 500 saneado; al recuperarse el mismo detalle vuelve a responder', async () => {
    const saved = await create(fullRecord());
    await db.query(`REVOKE SELECT ON cenit.purchase_request_lines FROM ${runtimeRole}`);
    try {
      const response = await detail(saved.id);
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).not.toMatch(/permission|purchase_request|SELECT|stack|denied/i);
      expect(leaks(text, saved)).toEqual([]);
      expect(JSON.parse(text).error.requestId).toBeTruthy();
    } finally { await db.query(`GRANT SELECT ON cenit.purchase_request_lines TO ${runtimeRole}`); }
    expect((await detail(saved.id)).status).toBe(200);
    expect(child!.exitCode).toBeNull(); // el proceso sigue vivo
  });
});

describe('HU07-T04: roles y sesiones ajenas no acceden a ninguna compra', () => {
  let saved: Awaited<ReturnType<typeof create>>;
  beforeAll(async () => { saved = await create(fullRecord()); });
  const rejected = async (response: Response, status: number) => {
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(leaks(text, saved)).toEqual([]);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return JSON.parse(text).error.code as string;
  };
  it('sin sesión → 401', async () => { expect(await rejected(await detail(saved.id, ''), 401)).toBe('AUTHENTICATION_REQUIRED'); });
  it.each(['docente', 'estudiante'])('%s → 403 en detalle y listado', async role => {
    expect(await rejected(await detail(saved.id, cookies[role]), 403)).toBe('FORBIDDEN');
    expect(await rejected(await fetch(`${base}/api/v1/purchases?reviewStatus=pending`, { headers: { cookie: cookies[role]! } }), 403)).toBe('FORBIDDEN');
  });
  it('rol ajeno recibe la misma respuesta para un id existente que para uno inexistente (no enumera)', async () => {
    for (const cookie of [cookies.docente, cookies.estudiante, '']) {
      const [existing, missing] = [await detail(saved.id, cookie), await detail(randomUUID(), cookie)];
      expect(existing.status).toBe(missing.status);
      expect((await existing.json()).error.code).toBe((await missing.json()).error.code);
    }
  });
  it('cabeceras de identidad/rol falsificadas no conceden acceso', async () => {
    const forged = { 'x-role': 'administrativo', 'x-account-id': randomUUID(), 'x-user-role': 'administrativo', authorization: 'Bearer administrativo', 'x-forwarded-user': 'admin' };
    await rejected(await detail(saved.id, '', forged), 401);
    await rejected(await detail(saved.id, cookies.docente, forged), 403);
  });
  it('cookie inventada o alterada → 401', async () => {
    const [name, value] = cookies.administrativo!.split('=') as [string, string];
    for (const cookie of [`${name}=${'0'.repeat(value.length)}`, `${name}=${value.slice(0, -2)}xx`, `${name}=`]) await rejected(await detail(saved.id, cookie), 401);
  });
  it('sesión vencida o revocada (logout) → 401', async () => {
    const expiring = await login('administrativo'), revoked = await login('administrativo');
    expect((await detail(saved.id, expiring)).status).toBe(200);
    const hash = createHash('sha256').update(expiring.split('=')[1]!).digest('hex');
    const moved = await db.query("UPDATE cenit.sessions SET created_at=created_at - interval '3 hours', expires_at=expires_at - interval '3 hours' WHERE token_hash=$1", [hash]);
    expect(moved.rowCount).toBe(1);
    await rejected(await detail(saved.id, expiring), 401);
    const logout = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: { origin: base, cookie: revoked, 'content-type': 'application/json' }, body: '{}' });
    expect(logout.status).toBe(204);
    await rejected(await detail(saved.id, revoked), 401);
  });
  it('rol cambiado o cuenta desactivada en el servidor se aplica en la siguiente consulta', async () => {
    const account = credentials.find(entry => entry.role === 'administrativo')!;
    const cookie = await login('administrativo');
    expect((await detail(saved.id, cookie)).status).toBe(200);
    try {
      await db.query("UPDATE cenit.accounts SET role='docente' WHERE email=$1", [account.email]);
      await rejected(await detail(saved.id, cookie), 403);
      await db.query("UPDATE cenit.accounts SET role='administrativo', active=false WHERE email=$1", [account.email]);
      await rejected(await detail(saved.id, cookie), 401);
    } finally { await db.query("UPDATE cenit.accounts SET role='administrativo', active=true WHERE email=$1", [account.email]); }
    expect((await detail(saved.id, cookie)).status).toBe(200);
  });
});
