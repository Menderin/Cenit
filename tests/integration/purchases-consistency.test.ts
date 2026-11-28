// HU05-T05 — Verificación independiente de consistencia y persistencia de compras.
// Todo el recorrido usa el servidor compilado (`apps/api/dist/server.js`, requiere `npm run build`)
// como proceso real, HTTP real y un rol PostgreSQL de runtime sin DDL, como en la VM.
// Las afirmaciones sobre filas se hacen con SQL directo, nunca sólo con la respuesta de la API.
// No se impone igualdad entre la suma de ítems y el total documental (contrato vigente).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import type { CreatePurchase } from '../../packages/contracts/src/purchases/index.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { createTestPool, closeTestPool } from './support/postgres.js';

const suffix = randomBytes(6).toString('hex');
const database = `cenit_t05_${suffix}`;
const runtimeRole = `cenit_t05_app_${suffix}`;
const runtimePassword = randomBytes(24).toString('hex');
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo'); url.username = 'cenit_admin'; url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString();
})();
const admin = createTestPool({ connectionString: adminUrl });
let db: Pool;
const dir = resolve('tmp/purchase-t05-tests', suffix);
const migratorFile = resolve(dir, 'migrator-url'), runtimeFile = resolve(dir, 'runtime-url');
const credentials = createDemoCredentials();
const account = credentials.find(entry => entry.role === 'administrativo')!;
let port = 0, base = '', cookie = '';
let child: ChildProcess | undefined;
let stderr = '';

const freePort = async () => {
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, '127.0.0.1', done));
  const value = (listener.address() as { port: number }).port;
  await new Promise<void>((done, fail) => listener.close(error => error ? fail(error) : done()));
  return value;
};
const startApi = async () => {
  stderr = '';
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
const stopApi = async (signal: NodeJS.Signals = 'SIGTERM') => {
  const current = child; child = undefined;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  const exited = new Promise<void>(done => current.once('exit', () => done()));
  current.kill(signal); await exited;
};
const apiDown = async () => { try { await fetch(`${base}/health/live`, { signal: AbortSignal.timeout(500) }); return false; } catch { return true; } };
const login = async () => {
  const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  expect(response.status).toBe(200);
  cookie = response.headers.get('set-cookie')!.split(';')[0]!;
};
const post = (payload: unknown) => fetch(`${base}/api/v1/purchases`, { method: 'POST', headers: { origin: base, cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const getDetail = (id: string) => fetch(`${base}/api/v1/purchases/${id}`, { headers: { cookie } });

/** Conteo global de ambas tablas: detecta cualquier fila parcial, no sólo la de una operación. */
const counts = async () => (await db.query(`SELECT (SELECT count(*)::int FROM cenit.purchase_requests) AS requests,
  (SELECT count(*)::int FROM cenit.purchase_request_lines) AS lines`)).rows[0] as { requests: number; lines: number };
const byOperation = async (operationId: string) => (await db.query(`SELECT p.id, (SELECT count(*)::int FROM cenit.purchase_request_lines l WHERE l.request_id=p.id) AS lines
  FROM cenit.purchase_requests p WHERE p.operation_id=$1`, [operationId])).rows as { id: string; lines: number }[];
/** Fotografía literal de cabecera e ítems tal como PostgreSQL los guarda. */
const dbSnapshot = async (id: string) => ({
  header: (await db.query('SELECT to_jsonb(p) - ARRAY[\'request_number_search\',\'description_search\'] AS row FROM cenit.purchase_requests p WHERE id=$1', [id])).rows[0]?.row,
  lines: (await db.query('SELECT to_jsonb(l) - \'provider_search\' AS row FROM cenit.purchase_request_lines l WHERE request_id=$1 ORDER BY position', [id])).rows.map(row => row.row),
});

const valid = (lines = 3): CreatePurchase => {
  const input = { ...structuredClone(manualPurchaseExample), operationId: randomUUID() };
  const template = input.lines[0]!;
  input.record.requestNumber = '000777'; // ceros a la izquierda deben conservarse como texto
  input.record.totalAmount = '1000';
  input.lines = Array.from({ length: lines }, (_, index) => ({ ...structuredClone(template), description: `Ítem T05 ${index + 1}`, provider: `Proveedor T05 ${index + 1}`, projectCode: '00000000', price: '100', amount: '100' }));
  return input;
};

beforeAll(async () => {
  process.env.APP_ENV = 'test';
  mkdirSync(dir, { recursive: true });
  await admin.query(`CREATE DATABASE ${database}`);
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  db = createTestPool({ connectionString: url.toString() });
  await db.query('CREATE SCHEMA cenit');
  writeFileSync(migratorFile, url.toString(), { mode: 0o600 });
  execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: migratorFile }, stdio: 'pipe' });
  // Rol de runtime sin CREATE ni propiedad de tablas, como `cenit_app` en la VM.
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await db.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE ${database} TO ${runtimeRole}; GRANT USAGE ON SCHEMA cenit TO ${runtimeRole};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cenit TO ${runtimeRole}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cenit TO ${runtimeRole};`);
  const runtimeUrl = new URL(url.toString()); runtimeUrl.username = runtimeRole; runtimeUrl.password = runtimePassword;
  writeFileSync(runtimeFile, runtimeUrl.toString(), { mode: 0o600 });
  await prepareDemoAccounts(db, credentials);
  port = await freePort(); base = `http://127.0.0.1:${port}`;
  await startApi(); await login();
});

afterAll(async () => {
  await stopApi();
  await db?.query('DROP TRIGGER IF EXISTS t05_fault ON cenit.purchase_request_lines').catch(() => undefined);
  if (db) await closeTestPool(db);
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
  await closeTestPool(admin);
  rmSync(dir, { recursive: true, force: true });
});

describe('HU05-T05: datos válidos contra PostgreSQL (servidor compilado)', () => {
  it('el runtime no tiene privilegios de DDL', async () => {
    const privileges = (await db.query(`SELECT has_schema_privilege($1,'cenit','CREATE') AS create_cenit, rolsuper FROM pg_roles WHERE rolname=$1`, [runtimeRole])).rows[0];
    expect(privileges).toEqual({ create_cenit: false, rolsuper: false });
  });
  it('guarda la fila y sus líneas completas; suma de líneas distinta del monto se acepta', async () => {
    for (const total of ['1', '1000', '999999']) { // ítems suman 300: menor, mayor y distinto
      const input = valid(); input.record.totalAmount = total;
      const before = await counts();
      const response = await post(input);
      expect(response.status).toBe(201);
      const saved = (await response.json()).data;
      expect(saved.record).toEqual(input.record); expect(saved.lines).toEqual(input.lines); expect(saved.oracle).toEqual(input.oracle);
      expect(await counts()).toEqual({ requests: before.requests + 1, lines: before.lines + 3 });
      const stored = await dbSnapshot(saved.id);
      expect(stored.header.request_number).toBe('000777'); expect(stored.header.total_amount).toBe(Number(total));
      expect(stored.lines.map((line: { position: number; project_code: string }) => [line.position, line.project_code])).toEqual([[1, '00000000'], [2, '00000000'], [3, '00000000']]);
    }
  });
});

describe('HU05-T05: datos inválidos no dejan filas parciales', () => {
  type Case = [string, (input: CreatePurchase) => unknown];
  const cases: Case[] = [
    ['total decimal', input => { input.record.totalAmount = '10.5'; }],
    ['total negativo', input => { input.record.totalAmount = '-1'; }],
    ['total exponencial', input => { input.record.totalAmount = '1e3'; }],
    ['total con cero a la izquierda', input => { input.record.totalAmount = '007'; }],
    ['total NaN', input => { input.record.totalAmount = 'NaN'; }],
    ['total numérico JSON', input => { (input.record as Record<string, unknown>).totalAmount = 1000; }],
    ['total de 256 dígitos', input => { input.record.totalAmount = '9'.repeat(256); }],
    ['total vacío', input => { input.record.totalAmount = '' as never; }],
    ['número de solicitud ausente', input => { (input.record as Record<string, unknown>).requestNumber = null; }],
    ['fecha inexistente', input => { input.record.recordDate = '2026-02-30'; }],
    ['año cero', input => { input.record.recordDate = '0000-01-01'; }],
    ['importe negativo en el último ítem', input => { input.lines.at(-1)!.amount = '-5'; }],
    ['precio no numérico en el último ítem', input => { input.lines.at(-1)!.price = 'abc'; }],
    ['importe decimal en un ítem intermedio', input => { input.lines[1]!.amount = '100.50'; }],
    ['101 ítems', input => { input.lines = Array.from({ length: 101 }, () => structuredClone(input.lines[0]!)); }],
    ['campo extra de rol en la fila', input => { (input.record as Record<string, unknown>).role = 'administrativo'; }],
    ['campo de revisión enviado por el cliente', input => { (input as Record<string, unknown>).reviewStatus = 'reviewed'; }],
    ['procedencia de ejemplo inexistente', input => { (input as Record<string, unknown>).origin = { type: 'contract_example', exampleId: 'oracle' }; }],
    ['operationId no UUID', input => { (input as Record<string, unknown>).operationId = 'reintento-1'; }],
  ];
  it.each(cases)('rechaza %s con 400, sin filas y sin SQL en la respuesta', async (_name, mutate) => {
    const input = valid(); mutate(input);
    const before = await counts();
    const response = await post(input);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toMatch(/SELECT|INSERT|purchase_request|stack|constraint/i);
    expect(await counts()).toEqual(before);
    if (typeof input.operationId === 'string' && /^[0-9a-f-]{36}$/.test(input.operationId)) expect(await byOperation(input.operationId)).toEqual([]);
  });
  it('un rechazo no consume la operación: la misma operationId luego guarda los datos corregidos', async () => {
    const input = valid(); const bad = structuredClone(input); bad.lines[2]!.amount = '-5';
    expect((await post(bad)).status).toBe(400);
    const response = await post(input);
    expect(response.status).toBe(201);
    expect(await byOperation(input.operationId)).toEqual([{ id: (await response.json()).data.id, lines: 3 }]);
  });
});

describe('HU05-T05: rollback ante fallo de PostgreSQL a mitad de la transacción', () => {
  it('un fallo en el 5.º ítem revierte cabecera e ítems 1–4; luego el reintento guarda todo', async () => {
    await db.query(`CREATE OR REPLACE FUNCTION cenit.t05_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.description = 'FALLA-CONTROLADA-T05' THEN RAISE EXCEPTION 'fallo inyectado T05'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER t05_fault BEFORE INSERT ON cenit.purchase_request_lines FOR EACH ROW EXECUTE FUNCTION cenit.t05_fault()');
    const input = valid(5); input.lines[4]!.description = 'FALLA-CONTROLADA-T05';
    try {
      const before = await counts();
      const response = await post(input);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toMatch(/fallo inyectado|t05_fault|INSERT|purchase_request/i);
      expect(await counts()).toEqual(before);
      expect(await byOperation(input.operationId)).toEqual([]);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS t05_fault ON cenit.purchase_request_lines');
      await db.query('DROP FUNCTION IF EXISTS cenit.t05_fault()');
    }
    const retry = await post(input);
    expect(retry.status).toBe(201);
    expect((await byOperation(input.operationId))[0]!.lines).toBe(5);
  });
});

describe('HU05-T05: doble intento no duplica', () => {
  it('la misma operación con otro contenido da 409 y no altera lo guardado', async () => {
    const input = valid(2); const saved = (await (await post(input)).json()).data;
    const snapshot = await dbSnapshot(saved.id), before = await counts();
    for (const change of [(x: CreatePurchase) => { x.record.description = 'Otro detalle'; }, (x: CreatePurchase) => { x.lines[1]!.amount = '101'; }, (x: CreatePurchase) => { x.lines.pop(); }]) {
      const altered = structuredClone(input); change(altered);
      const response = await post(altered);
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('OPERATION_CONFLICT');
    }
    expect(await counts()).toEqual(before);
    expect(await dbSnapshot(saved.id)).toEqual(snapshot);
  });
});

describe('HU05-T05: el registro persiste tras reiniciar la aplicación', () => {
  it('SIGTERM y nuevo arranque: detalle, listado, filas SQL y sesión se conservan; el reintento no duplica', async () => {
    const input = { ...valid(3), origin: { type: 'contract_example' as const, exampleId: 'partial' as const } };
    const created = await post(input); expect(created.status).toBe(201);
    const saved = (await created.json()).data, snapshot = await dbSnapshot(saved.id), before = await counts();
    expect(saved.record).toEqual(input.record); expect(saved.lines).toEqual(input.lines);
    expect(saved.oracle).toEqual(input.oracle); expect(saved.exampleId).toBe('partial');
    await stopApi('SIGTERM');
    expect(await apiDown()).toBe(true);
    await startApi();
    const read = await getDetail(saved.id); // misma cookie: la sesión vive en PostgreSQL
    expect(read.status).toBe(200); expect((await read.json()).data).toEqual(saved);
    const list = await fetch(`${base}/api/v1/purchases?q=000777&pageSize=100`, { headers: { cookie } });
    expect((await list.json()).data.map((row: { id: string }) => row.id)).toContain(saved.id);
    expect(await dbSnapshot(saved.id)).toEqual(snapshot);
    const retry = await post(input);
    expect(retry.status).toBe(200); expect((await retry.json()).data.id).toBe(saved.id);
    expect(await counts()).toEqual(before);
  });
  it('caída abrupta (SIGKILL) durante una escritura no deja filas; tras arrancar, el reintento guarda completo', async () => {
    await db.query(`CREATE OR REPLACE FUNCTION cenit.t05_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.description = 'PAUSA-T05' THEN PERFORM pg_sleep(5); END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER t05_fault BEFORE INSERT ON cenit.purchase_request_lines FOR EACH ROW EXECUTE FUNCTION cenit.t05_fault()');
    const input = valid(3); input.lines[1]!.description = 'PAUSA-T05';
    const before = await counts();
    try {
      const pending = post(input).catch(() => null);
      // Espera a que la transacción esté abierta con la cabecera ya insertada (aún invisible a otros).
      let inside = false;
      for (let retry = 0; retry < 50 && !inside; retry++) {
        inside = (await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event='PgSleep'", [database])).rows[0].n > 0;
        if (!inside) await new Promise(done => setTimeout(done, 100));
      }
      expect(inside).toBe(true);
      await stopApi('SIGKILL');
      expect(await pending).toBeNull();
      // PostgreSQL aborta la transacción del cliente desconectado al terminar la sentencia en curso.
      for (let retry = 0; retry < 100; retry++) {
        const active = (await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND state <> 'idle'", [database, runtimeRole])).rows[0].n;
        if (!active) break;
        await new Promise(done => setTimeout(done, 100));
      }
      expect(await counts()).toEqual(before);
      expect(await byOperation(input.operationId)).toEqual([]);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS t05_fault ON cenit.purchase_request_lines');
      await db.query('DROP FUNCTION IF EXISTS cenit.t05_fault()');
    }
    await startApi();
    const retry = await post(input);
    expect(retry.status).toBe(201);
    expect(await counts()).toEqual({ requests: before.requests + 1, lines: before.lines + 3 });
  }, 30000);
});
