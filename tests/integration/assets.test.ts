// Bienes (propuesta general) — carreras y validaciones que sólo PostgreSQL y el servidor compilado pueden demostrar.
// Usa el servidor compilado (`apps/api/dist/server.js`, requiere `npm run build`), una base descartable propia
// y un rol de runtime sin DDL, igual que las pruebas de compras.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { createTestPool, closeTestPool } from './support/postgres.js';

const suffix = randomBytes(6).toString('hex');
const database = `cenit_assets_${suffix}`;
const runtimeRole = `cenit_assets_app_${suffix}`;
const runtimePassword = randomBytes(24).toString('hex');
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo'); url.username = 'cenit_admin'; url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString();
})();
const admin = createTestPool({ connectionString: adminUrl });
let db: Pool;
const dir = resolve('tmp/assets-tests', suffix);
const migratorFile = resolve(dir, 'migrator-url'), runtimeFile = resolve(dir, 'runtime-url');
const credentials = createDemoCredentials();
const account = credentials.find(entry => entry.role === 'administrativo')!;
let base = '', cookie = '';
let child: ChildProcess | undefined;
let stderr = '';

const freePort = async () => {
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, '127.0.0.1', done));
  const value = (listener.address() as { port: number }).port;
  await new Promise<void>((done, fail) => listener.close(error => error ? fail(error) : done()));
  return value;
};
const api = (path: string, method = 'GET', body?: unknown) => fetch(`${base}/api/v1/assets${path}`, {
  method, headers: { origin: base, cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const newPerson = async (name: string) => (await (await api('/people', 'POST', { name, rut: null, unit: 'Docencia', position: null })).json()).data as { id: string };
const newAsset = async (description: string, custodianId: string | null = null) => {
  const response = await api('/', 'POST', {
    operationId: randomUUID(), kind: 'equipo', quantity: 1, description, inventoryNumber: null, brand: 'Marca', model: 'Modelo', serialNumber: null, furnitureType: null, material: null,
    dimensions: null, area: null, systemPart: false, wallMounted: false, assembled: false, notes: null, purchaseId: null, location: 'Docencia', custodianId, registeredOn: today(),
  });
  expect(response.status).toBe(201);
  return (await response.json()).data as { id: string };
};
const loanBody = (borrowerId: string, assetIds: string[]) => ({
  operationId: randomUUID(), borrowerId, loanedOn: today(), dueOn: null, location: null, authorizerName: 'Autoriza Ficticio', authorizerUnit: null, notes: null, assetIds,
});

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
  child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'production', APP_ENV: 'demo', HOST: '127.0.0.1', PORT: String(port), DATABASE_URL_FILE: runtimeFile, AUTH_COOKIE_SECURE: 'false', AUTH_ALLOWED_ORIGINS: base },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr!.on('data', chunk => { stderr += String(chunk); });
  for (let retry = 0; retry < 150; retry++) {
    if (child.exitCode !== null) throw new Error(`La API terminó antes de estar disponible: ${stderr}`);
    try { if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* sondeo acotado */ }
    await new Promise(done => setTimeout(done, 100));
  }
  const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  expect(login.status).toBe(200);
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
});

afterAll(async () => {
  const current = child; child = undefined;
  if (current && current.exitCode === null) { const exited = new Promise<void>(done => current.once('exit', () => done())); current.kill('SIGTERM'); await exited; }
  if (db) await closeTestPool(db);
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
  await closeTestPool(admin);
  rmSync(dir, { recursive: true, force: true });
});

describe('Bienes: préstamos simultáneos', () => {
  it('de dos préstamos del mismo bien sólo uno se acepta y el inventario no lo duplica', async () => {
    const borrower = await newPerson('Persona ficticia carrera');
    for (let round = 0; round < 5; round++) { // varias rondas: la carrera depende del orden de los bloqueos
      const token = `carrera${randomBytes(4).toString('hex')}`; // palabra única: la búsqueda no distingue «Bien 1» de «Bien 10»
      const asset = await newAsset(`Bien ${token}`);
      const statuses = (await Promise.all([api('/loans', 'POST', loanBody(borrower.id, [asset.id])), api('/loans', 'POST', loanBody(borrower.id, [asset.id]))])).map(response => response.status).sort();
      expect(statuses).toEqual([201, 409]);
      const open = await db.query(`SELECT count(*)::int AS n FROM cenit.asset_loan_items i JOIN cenit.asset_loans l ON l.id = i.loan_id WHERE i.asset_id = $1 AND l.returned_on IS NULL`, [asset.id]);
      expect(open.rows[0].n).toBe(1);
      const list = await (await api(`/?q=${token}`)).json();
      expect(list.data.filter((row: { id: string }) => row.id === asset.id)).toHaveLength(1);
    }
  });
});

describe('Bienes: «por revisar» y responsables', () => {
  it('cuenta y lista el bien prestado cuyo responsable ya no pertenece', async () => {
    const holder = await newPerson('Responsable que se va');
    const borrower = await newPerson('Persona que recibe el préstamo');
    const asset = await newAsset('Bien prestado de quien se va', holder.id);
    expect((await api('/loans', 'POST', loanBody(borrower.id, [asset.id]))).status).toBe(201);
    expect((await api(`/people/${holder.id}/status`, 'POST', { active: false })).status).toBe(200);
    const summary = (await (await api('/summary')).json()).data;
    expect(summary.review).toBe(1);
    expect(summary.peopleReview).toBe(1);
    const review = await (await api('/?status=revisar')).json();
    expect(review.data.map((row: { id: string; status: string }) => [row.id, row.status])).toEqual([[asset.id, 'prestamo']]);
  });
});

describe('Bienes: validaciones con mensaje claro', () => {
  it('rechaza con 422 una fecha que no existe en el calendario, sin error 500', async () => {
    const receiver = await newPerson('Persona fechas');
    const asset = await newAsset('Bien fechas');
    const response = await api('/deliveries', 'POST', {
      operationId: randomUUID(), receiverId: receiver.id, deliveredOn: '2026-02-31', reason: 'Prueba', destination: null, giverName: 'Entrega Ficticio', giverPosition: null, giverUnit: null, notes: null,
      items: [{ assetId: asset.id }],
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toMatch(/no existe en el calendario/);
  });
  it('rechaza con 422 un carácter que el PDF no puede imprimir', async () => {
    const response = await api('/people', 'POST', { name: 'Ana ✓ Ficticia', rut: null, unit: null, position: null });
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toMatch(/no se puede imprimir/);
  });
  it('limita a ocho los bienes de una entrega, las filas del acta oficial', async () => {
    const receiver = await newPerson('Persona límite');
    const response = await api('/deliveries', 'POST', {
      operationId: randomUUID(), receiverId: receiver.id, deliveredOn: today(), reason: 'Prueba', destination: null, giverName: 'Entrega Ficticio', giverPosition: null, giverUnit: null, notes: null,
      items: Array.from({ length: 9 }, () => ({ assetId: randomUUID() })),
    });
    expect(response.status).toBe(400);
  });
  it('presta un solo bien por documento, como el formulario oficial', async () => {
    const borrower = await newPerson('Persona préstamo único');
    expect((await api('/loans', 'POST', loanBody(borrower.id, [randomUUID(), randomUUID()]))).status).toBe(400);
  });
});
