import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Value } from '@sinclair/typebox/value';
import { SessionResponseSchema } from '../../packages/contracts/src/auth/index.js';
import { ErrorResponseSchema } from '../../packages/contracts/src/common/index.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { AuthRepository } from '../../apps/api/src/modules/auth/repositories/auth.js';
import { AuthService, sessionHash } from '../../apps/api/src/modules/auth/services/auth.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { createDemoCredentials, demoPasswordKeys, demoPasswordsFromEnv, prepareDemoAccounts, privateDemoCredentials, type DemoPasswords } from '../../db/seeds/auth-demo.js';
import { loadCatalog, readCatalog } from '../../db/seeds/load-academic.js';

const suffix = randomBytes(6).toString('hex');
const databases = [`cenit_auth_test_${suffix}_empty`, `cenit_auth_test_${suffix}_existing`];
const migrationRole = `auth_migrator_${suffix}`, runtimeRole = `auth_runtime_${suffix}`;
const migrationPassword = randomBytes(24).toString('hex'), runtimePassword = randomBytes(24).toString('hex');
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo');
  url.username = 'cenit_admin'; url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString();
})();
const connection = (database: string, role?: string, password?: string) => {
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  if (role) { url.username = role; url.password = password!; } return url.toString();
};
const admin = createTestPool({ connectionString: adminUrl });
const migrations: pg.Pool[] = [], runtimes: pg.Pool[] = [];
const credentials = createDemoCredentials(), plan = readCatalog('catalogs/academic/nutricion-diagrama-r2.json');
const origin = 'http://127.0.0.1:3000';
let now = new Date('2026-10-11T22:00:00.000Z');
let app: ReturnType<typeof buildAcademicApp>;
const service = () => new AuthService(new AuthRepository(runtimes[0]!), () => new Date(now));
const build = (secure = false) => buildAcademicApp({ repository: new AcademicRepository(runtimes[0]!), purchases: new PurchaseRepository(runtimes[0]!), purchaseCapabilities: { secondReviewEnabled: true, sheetsSyncEnabled: false }, auth: { service: service(), config: { allowedOrigins: [origin], cookieSecure: secure } } });
let ipCounter = 1;
const login = (role = 'docente', body?: Record<string, unknown>, cookie?: string, remoteAddress?: string) => {
  const credential = credentials.find(c => c.role === role)!;
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin, ...(cookie ? { cookie } : {}) },
    payload: body ?? { email: credential.email, password: credential.password }, remoteAddress: remoteAddress ?? `192.0.2.${ipCounter++}` });
};
const cookieFrom = (response: { headers: Record<string, unknown> }) => String(response.headers['set-cookie']).split(';')[0]!;
const tokenFrom = (cookie: string) => cookie.split('=')[1]!;
const runMigrator = (url: string) => {
  const dir = resolve('tmp/auth-tests', suffix); mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'migration-url'); writeFileSync(file, url, { mode: 0o600 });
  try { execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: file }, stdio: 'pipe' }); }
  finally { unlinkSync(file); }
};
beforeAll(async () => {
  process.env.APP_ENV = 'test';
  await admin.query(`CREATE ROLE ${migrationRole} LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  for (const [index, database] of databases.entries()) {
    await admin.query(`CREATE DATABASE ${database}`);
    const provisioner = createTestPool({ connectionString: connection(database) });
    try { await provisioner.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE ${database} TO ${migrationRole},${runtimeRole}; CREATE SCHEMA cenit AUTHORIZATION ${migrationRole}; GRANT USAGE ON SCHEMA cenit TO ${runtimeRole}`); }
    finally { await closeTestPool(provisioner); }
    const url = connection(database, migrationRole, migrationPassword), migration = createTestPool({ connectionString: url }); migrations.push(migration);
    await migration.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA cenit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtimeRole}`);
    if (index === 1) {
      // Simulate a database with the previous, already applied catalog migrations and rows.
      await migration.query('CREATE TABLE cenit.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)');
      for (const file of readMigrationFiles({ migrationsFolder: 'db/migrations' }).slice(0, 2)) {
        for (const statement of file.sql) if (statement.trim()) await migration.query(statement);
        await migration.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [file.hash, file.folderMillis]);
      }
      await loadCatalog(migration, plan, true);
    }
    runMigrator(url); runMigrator(url);
    runtimes.push(createTestPool({ connectionString: connection(database, runtimeRole, runtimePassword) }));
  }
  await loadCatalog(migrations[0]!, plan, true);
  app = build(); await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
  await Promise.all([...migrations, ...runtimes].map(p => closeTestPool(p)));
  for (const database of databases) await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const role of [runtimeRole, migrationRole]) await admin.query(`DROP ROLE IF EXISTS ${role}`);
  await closeTestPool(admin);
});

describe('migraciones y preparación de cuentas', () => {
  it('migraciones repetibles conservan catálogo y no crean cuentas/historial', async () => {
    for (const pool of runtimes) {
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.accounts')).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.sessions')).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.academic_courses')).rows[0].n).toBe(52);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.academic_students')).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.academic_attempts')).rows[0].n).toBe(0);
      expect((await pool.query("SELECT has_schema_privilege(current_user,'cenit','CREATE') AS can_create")).rows[0].can_create).toBe(false);
    }
  });
  it('preparación guarda hashes, no rota y revierte inconsistencias', async () => {
    await prepareDemoAccounts(runtimes[0]!, credentials);
    const before = (await runtimes[0]!.query('SELECT id,password_hash FROM cenit.accounts ORDER BY id')).rows;
    await prepareDemoAccounts(runtimes[0]!, credentials);
    expect((await runtimes[0]!.query('SELECT id,password_hash FROM cenit.accounts ORDER BY id')).rows).toEqual(before);
    for (const row of before) expect(row.password_hash).not.toContain(credentials.find(c => c.id === row.id)!.password);
    const altered = credentials.map(c => ({ ...c, password: randomBytes(24).toString('hex') }));
    await expect(prepareDemoAccounts(runtimes[0]!, altered)).rejects.toThrow();
    expect((await runtimes[0]!.query('SELECT id,password_hash FROM cenit.accounts ORDER BY id')).rows).toEqual(before);
    await expect(prepareDemoAccounts(runtimes[1]!, [{ ...credentials[0]!, name: '' }, ...credentials.slice(1)])).rejects.toThrow();
    expect((await runtimes[1]!.query('SELECT count(*)::int AS n FROM cenit.accounts')).rows[0].n).toBe(0);
  });
  it('archivo privado reutilizable y comando deshabilitado fuera de demo/test', async () => {
    const root = resolve('tmp/auth-tests', suffix, 'private');
    const first = privateDemoCredentials(root);
    expect(privateDemoCredentials(root)).toEqual(first);
    process.env.APP_ENV = 'production';
    try { await expect(prepareDemoAccounts(runtimes[0]!, credentials)).rejects.toThrow(); }
    finally { process.env.APP_ENV = 'test'; }
  });
  it('acepta claves compartidas privadas y conserva identidades al repetir la preparación', () => {
    const passwords = Object.fromEntries(credentials.map(c => [c.role, c.password])) as DemoPasswords;
    const env = Object.fromEntries(Object.entries(demoPasswordKeys).map(([role, key]) => [key, passwords[role as keyof DemoPasswords]]));
    expect(demoPasswordsFromEnv(env)).toEqual(passwords);
    const root = resolve('tmp/auth-tests', suffix, 'shared-private');
    const first = privateDemoCredentials(root, passwords);
    expect(first.every(c => c.password === passwords[c.role])).toBe(true);
    expect(privateDemoCredentials(root, passwords)).toEqual(first);
    expect(() => privateDemoCredentials(root, { ...passwords, docente: randomBytes(24).toString('hex') })).toThrow();
    expect(privateDemoCredentials(root, passwords)).toEqual(first);
  });
  it('rechaza configuración parcial o corta sin incluir claves en errores', () => {
    expect(demoPasswordsFromEnv({})).toBeUndefined();
    expect(() => demoPasswordsFromEnv({ [demoPasswordKeys.docente]: credentials[0]!.password })).toThrow();
    expect(() => demoPasswordsFromEnv(Object.fromEntries(Object.values(demoPasswordKeys).map(key => [key, 'short'])))).toThrow();
    expect(() => createDemoCredentials({ docente: 'short', estudiante: 'short', administrativo: 'short' })).toThrow();
  });
  it('BD exige correo normalizado/único, nombre, rol y hash protegido', async () => {
    const base = credentials[0]!, hash = (await runtimes[0]!.query('SELECT password_hash FROM cenit.accounts WHERE id=$1', [base.id])).rows[0].password_hash;
    await expect(runtimes[0]!.query('INSERT INTO cenit.accounts(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [randomUUID(), base.email, base.name, base.role, hash])).rejects.toMatchObject({ code: '23505' });
    for (const [email, name, role, digest] of [
      ['Upper@cenit.invalid', 'Demo', 'docente', hash], ['invalid', 'Demo', 'docente', hash],
      ['new@cenit.invalid', ' ', 'docente', hash], ['new@cenit.invalid', 'Demo', 'otro', hash],
      ['new@cenit.invalid', 'Demo', 'docente', 'unprotected'],
    ]) await expect(runtimes[0]!.query('INSERT INTO cenit.accounts(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [randomUUID(), email, name, role, digest])).rejects.toMatchObject({ code: '23514' });
  });
  it('BD exige cuenta existente, digest y duración fija de sesión', async () => {
    const id = credentials[0]!.id, hash = randomBytes(32).toString('hex'), later = new Date(now.getTime() + 7200000);
    await expect(runtimes[0]!.query('INSERT INTO cenit.sessions VALUES($1,$2,$3,$4,NULL)', [hash, randomUUID(), now, later])).rejects.toMatchObject({ code: '23503' });
    await expect(runtimes[0]!.query('INSERT INTO cenit.sessions VALUES($1,$2,$3,$4,NULL)', ['invalid', id, now, later])).rejects.toMatchObject({ code: '23514' });
    await expect(runtimes[0]!.query('INSERT INTO cenit.sessions VALUES($1,$2,$3,$4,NULL)', [hash, id, now, now])).rejects.toMatchObject({ code: '23514' });
  });
});

describe('login real, permisos y sesión', () => {
  it.each(['docente', 'estudiante', 'administrativo'])('autentica %s y aplica permisos académicos', async role => {
    const response = await login(role), cookie = cookieFrom(response);
    expect(response.statusCode).toBe(200); expect(Value.Check(SessionResponseSchema, response.json())).toBe(true);
    expect(response.json().data.account.role).toBe(role);
    expect(response.body).not.toContain(tokenFrom(cookie)); expect(response.body).not.toContain('password');
    expect(response.headers['set-cookie']).toContain('HttpOnly'); expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    expect(response.headers['set-cookie']).toContain('Max-Age=7200'); expect(response.headers['set-cookie']).not.toContain('Domain=');
    const current = await app.inject({ url: '/api/v1/auth/session', headers: { cookie } });
    expect(current.json()).toEqual(response.json());
    const result = await app.inject({ url: `/api/v1/academic/plans/${plan.planId}/versions/${plan.version}`, headers: { cookie } });
    expect(result.statusCode).toBe(role === 'administrativo' ? 403 : 200);
    if (role !== 'administrativo') expect(result.json().data.courses).toHaveLength(52);
    const row = (await runtimes[0]!.query('SELECT token_hash FROM cenit.sessions WHERE token_hash=$1', [sessionHash(tokenFrom(cookie))])).rows[0];
    expect(row.token_hash).not.toBe(tokenFrom(cookie));
  });
  it('normaliza correo sin transformar contraseña y rechaza credenciales sin enumerar', async () => {
    const credential = credentials[0]!;
    expect((await login('docente', { email: credential.email.toUpperCase(), password: credential.password })).statusCode).toBe(200);
    const incorrect = await login('docente', { email: credential.email, password: randomBytes(24).toString('hex') });
    const absent = await login('docente', { email: 'ausente@cenit.invalid', password: randomBytes(24).toString('hex') });
    await runtimes[0]!.query('UPDATE cenit.accounts SET active=false WHERE id=$1', [credential.id]);
    try {
      const disabled = await login();
      for (const response of [incorrect, absent, disabled]) {
        expect(response.statusCode).toBe(401); expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.json().error.code).toBe('INVALID_CREDENTIALS'); expect(response.json().error.message).toBe(incorrect.json().error.message);
      }
    } finally { await runtimes[0]!.query('UPDATE cenit.accounts SET active=true WHERE id=$1', [credential.id]); }
  });
  it('rechaza manipulación de rol, tipos, campos extra y JSON malformado', async () => {
    const credential = credentials[0]!;
    for (const body of [ { email: credential.email, password: credential.password, role: 'administrativo' }, { email: 'bad', password: credential.password }, { email: credential.email, password: 123 } ]) {
      const response = await login('docente', body); expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    const broken = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin, 'content-type': 'application/json' }, payload: '{' });
    expect(broken.statusCode).toBe(400); expect(Value.Check(ErrorResponseSchema, broken.json())).toBe(true);
  });
  it('Origin obligatorio en login y logout; no acepta headers de identidad', async () => {
    for (const path of ['/login', '/logout']) for (const header of [undefined, 'https://externo.invalid', 'null']) {
      const response = await app.inject({ method: 'POST', url: `/api/v1/auth${path}`, headers: header ? { origin: header } : {}, payload: {} });
      expect(response.statusCode).toBe(403);
    }
    const anonymous = await app.inject({ url: '/api/v1/academic/plans', headers: { authorization: 'Bearer teacher', 'x-role': 'docente' } });
    expect(anonymous.statusCode).toBe(401);
  });
  it('expira exactamente a dos horas sin renovar tras lectura', async () => {
    const start = new Date(now), response = await login(), cookie = cookieFrom(response);
    try {
      now = new Date(start.getTime() + 7199999);
      const valid = await app.inject({ url: '/api/v1/auth/session', headers: { cookie } });
      expect(valid.statusCode).toBe(200); expect(valid.json().data.expiresAt).toBe(response.json().data.expiresAt);
      now = new Date(start.getTime() + 7200000);
      expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).statusCode).toBe(401);
      expect((await app.inject({ url: '/api/v1/academic/plans', headers: { cookie } })).statusCode).toBe(401);
    } finally { now = start; }
  });
  it('logout revoca, elimina cookie y puede repetirse', async () => {
    const cookie = cookieFrom(await login());
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin, cookie }, payload: {} });
      expect(response.statusCode).toBe(204); expect(response.body).toBe(''); expect(response.headers['set-cookie']).toContain('Max-Age=0');
    }
    expect((await app.inject({ url: '/api/v1/academic/plans', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin }, payload: {} })).statusCode).toBe(204);
  });
  it.each(['cerrada', 'vencida', 'sustituida'] as const)('una sesión %s rechaza lecturas y escrituras sin modificar compras', async state => {
    const start = new Date(now);
    const loggedIn = await login('administrativo'), cookie = cookieFrom(loggedIn);
    const headers = { origin, cookie };
    const input = { ...structuredClone(manualPurchaseExample), operationId: randomUUID() };
    const created = await app.inject({ method: 'POST', url: '/api/v1/purchases', headers, payload: input });
    expect(created.statusCode).toBe(201);
    const saved = created.json().data;
    const repository = new PurchaseRepository(runtimes[0]!);
    const counts = async () => (await runtimes[0]!.query('SELECT (SELECT count(*) FROM cenit.purchase_requests) AS requests, (SELECT count(*) FROM cenit.purchase_request_lines) AS lines')).rows[0];
    const before = await counts();
    try {
      if (state === 'cerrada') {
        expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers, payload: {} })).statusCode).toBe(204);
      } else if (state === 'vencida') {
        now = new Date(start.getTime() + 7200000);
      } else {
        expect((await login('docente', undefined, cookie)).statusCode).toBe(200);
      }
      // Reuse the actual old cookie: an anonymous request would not prove invalidation.
      const routes: ['GET' | 'POST' | 'PUT' | 'DELETE', string, unknown?][] = [
        ['GET', '/api/v1/auth/session'], ['GET', '/api/v1/academic/plans'],
        ['GET', '/api/v1/purchases'], ['GET', '/api/v1/purchases/summary'],
        ['GET', `/api/v1/purchases/${saved.id}`],
        ['POST', '/api/v1/purchases', { ...input, operationId: randomUUID() }],
        ['PUT', `/api/v1/purchases/${saved.id}`, { expectedVersion: 1, header: { ...input.header, description: 'Cambio que debe rechazarse' }, administrative: input.administrative, lines: [] }],
        ['POST', `/api/v1/purchases/${saved.id}/validation`, { expectedVersion: 1 }],
        ['DELETE', `/api/v1/purchases/${saved.id}`, { expectedVersion: 1 }],
      ];
      for (const [method, url, payload] of routes) {
        const response = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
        expect(response.statusCode, `${state}: ${method} ${url}`).toBe(401);
        expect(Value.Check(ErrorResponseSchema, response.json())).toBe(true);
        expect(response.json().error.code).toBe('AUTHENTICATION_REQUIRED');
        expect(response.headers['cache-control']).toBe('no-store');
      }
      expect(await counts()).toEqual(before);
      expect(await repository.get(saved.id)).toEqual(saved);
    } finally { now = start; }
  });
  it('nuevo login sustituye sesión del navegador; rol y activación se leen del servidor', async () => {
    const previous = cookieFrom(await login('docente'));
    const current = cookieFrom(await login('estudiante', undefined, previous));
    expect(current).not.toBe(previous);
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie: previous } })).statusCode).toBe(401);
    const id = credentials.find(c => c.role === 'estudiante')!.id;
    await runtimes[0]!.query("UPDATE cenit.accounts SET role='administrativo' WHERE id=$1", [id]);
    try { expect((await app.inject({ url: '/api/v1/academic/plans', headers: { cookie: current } })).statusCode).toBe(403); }
    finally { await runtimes[0]!.query("UPDATE cenit.accounts SET role='estudiante' WHERE id=$1", [id]); }
    await runtimes[0]!.query('UPDATE cenit.accounts SET active=false WHERE id=$1', [id]);
    try { expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie: current } })).statusCode).toBe(401); }
    finally { await runtimes[0]!.query('UPDATE cenit.accounts SET active=true WHERE id=$1', [id]); }
  });
  it('limita diez intentos por IP sin confiar en X-Forwarded-For', async () => {
    const credential = credentials[0]!, remoteAddress = '198.51.100.100';
    for (let i = 0; i < 10; i++) expect((await login('docente', { email: credential.email, password: randomBytes(24).toString('hex') }, undefined, remoteAddress)).statusCode).toBe(401);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress, headers: { origin, 'x-forwarded-for': '198.51.100.101' }, payload: { email: credential.email, password: credential.password } });
    expect(response.statusCode).toBe(429); expect(response.json().error.code).toBe('RATE_LIMIT_EXCEEDED'); expect(Value.Check(ErrorResponseSchema, response.json())).toBe(true);
    expect(response.headers['retry-after']).toBeDefined();
  });
  it('Secure se incluye cuando está configurado', async () => {
    const secureApp = build(true); await secureApp.ready();
    try {
      const credential = credentials[0]!;
      const response = await secureApp.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: credential.email, password: credential.password } });
      expect(response.statusCode).toBe(200); expect(response.headers['set-cookie']).toContain('Secure');
    } finally { await secureApp.close(); }
  });
  it('fallo de BD se sanea sin SQL, rutas ni trazas', async () => {
    await migrations[0]!.query('ALTER TABLE cenit.sessions RENAME TO sessions_temporarily_unavailable');
    try {
      const response = await login(); expect(response.statusCode).toBe(503); expect(Value.Check(ErrorResponseSchema, response.json())).toBe(true);
      expect(response.body).not.toMatch(/SELECT|INSERT|password|stack|cenit\./); expect(response.headers['set-cookie']).toBeUndefined();
    } finally { await migrations[0]!.query('ALTER TABLE cenit.sessions_temporarily_unavailable RENAME TO sessions'); }
  });
});
