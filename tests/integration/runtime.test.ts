import { beforeAll, afterAll, test, expect } from 'vitest';
import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createReadiness } from '../../apps/api/src/infrastructure/database/readiness.js';
import { registerFrontend } from '../../apps/api/src/infrastructure/plugins/frontend.js';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { createRuntimeApp } from '../../apps/api/src/runtime.js';

const suffix = randomBytes(6).toString('hex');
const database = `cenit_runtime_${suffix}`, role = `runtime_${suffix}`, password = randomBytes(24).toString('hex');
const adminUrl = process.env.ACADEMIC_TEST_ADMIN_URL_FILE ? readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim()
  : process.env.DATABASE_URL ?? (() => { const url = new URL('postgres://cenit_admin@127.0.0.1:55432/cenit_demo'); url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString(); })();
const url = new URL(adminUrl); url.pathname = `/${database}`;
const admin = createTestPool({ connectionString: adminUrl });
const provisioner = createTestPool({ connectionString: url.toString() });
const runtimeUrl = new URL(url); runtimeUrl.username = role; runtimeUrl.password = password;
const folder = resolve('db/migrations');
let health: ReturnType<typeof createReadiness>;
let frontend: ReturnType<typeof createRuntimeApp>;
beforeAll(async () => {
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE DATABASE ${database}`);
  await provisioner.query(`CREATE SCHEMA cenit; GRANT USAGE ON SCHEMA cenit TO ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA cenit GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${role}`);
  health = createReadiness(runtimeUrl.toString(), folder);
  expect(await health.check()).toBe(false);
  const dir = resolve('tmp/runtime-tests', suffix); mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'migration-url'); writeFileSync(file, url.toString(), { mode: 0o600 });
  try { execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: file }, stdio: 'pipe' }); }
  finally { rmSync(file); }
  const previous = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'production', APP_ENV: 'test', DATABASE_URL: runtimeUrl.toString(), AUTH_COOKIE_SECURE: 'false', AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:5174' });
  delete process.env.DATABASE_URL_FILE;
  try { frontend = createRuntimeApp(); } finally { process.env = previous; }
  await frontend.ready();
});
afterAll(async () => {
  if (frontend) await frontend.close();
  if (health) await health.close();
  await closeTestPool(provisioner);
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${role}`);
  await closeTestPool(admin);
});
test('readiness sin semillas; acepta migraciones posteriores y rechaza hashes alterados', async () => {
  const ready = await frontend.inject({ url: '/health/ready' });
  expect(ready.statusCode).toBe(200); expect(ready.json()).toEqual({ status: 'ready' });
  expect(await health.check()).toBe(true);
  await provisioner.query("INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES('future',9999999999999)");
  expect(await health.check()).toBe(true);
  await provisioner.query("DELETE FROM cenit.__drizzle_migrations WHERE hash='future'");
  const { rows } = await provisioner.query('SELECT id,hash FROM cenit.__drizzle_migrations ORDER BY created_at LIMIT 1');
  await provisioner.query("UPDATE cenit.__drizzle_migrations SET hash='altered' WHERE id=$1", [rows[0].id]);
  expect(await health.check()).toBe(false);
  await provisioner.query('UPDATE cenit.__drizzle_migrations SET hash=$1 WHERE id=$2', [rows[0].hash, rows[0].id]);
  await provisioner.query('UPDATE cenit.__drizzle_migrations SET created_at=created_at+1 WHERE id=$1', [rows[0].id]);
  const unavailable = await frontend.inject({ url: '/health/ready' });
  expect(unavailable.statusCode).toBe(503); expect(unavailable.json()).toEqual({ status: 'unavailable' });
  await provisioner.query('UPDATE cenit.__drizzle_migrations SET created_at=created_at-1 WHERE id=$1', [rows[0].id]);
  expect(await health.check()).toBe(true);
});
test('readiness rechaza relaciones/columnas/permisos ausentes y se recupera', async () => {
  await provisioner.query('ALTER TABLE cenit.purchase_requests RENAME COLUMN example_id TO hidden_example_id');
  expect(await health.check()).toBe(false);
  await provisioner.query('ALTER TABLE cenit.purchase_requests RENAME COLUMN hidden_example_id TO example_id');
  await provisioner.query('ALTER TABLE cenit.sessions RENAME TO hidden_sessions');
  expect(await health.check()).toBe(false);
  await provisioner.query('ALTER TABLE cenit.hidden_sessions RENAME TO sessions');
  await provisioner.query(`REVOKE SELECT ON cenit.accounts FROM ${role}`);
  expect(await health.check()).toBe(false);
  await provisioner.query(`GRANT SELECT ON cenit.accounts TO ${role}`);
  expect(await health.check()).toBe(true);
});
test('BD inaccesible devuelve no disponible sin propagar errores', async () => {
  const unavailable = new URL(runtimeUrl); unavailable.port = '1';
  const failed = createReadiness(unavailable.toString(), folder);
  try { expect(await failed.check()).toBe(false); } finally { await failed.close(); }
});
test('SPA sirve HTML en rutas directas y HEAD; assets reales conservan MIME', async () => {
  for (const path of ['/', '/login', '/compras', '/academico', '/administracion/compras/nueva']) {
    const response = await frontend.inject({ url: path });
    expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toContain('text/html');
  }
  const head = await frontend.inject({ method: 'HEAD', url: '/login' });
  expect(head.statusCode).toBe(200); expect(head.body).toBe('');
  const asset = readdirSync('apps/web/dist/assets').find(file => file.endsWith('.js'))!;
  const response = await frontend.inject({ url: `/assets/${asset}` });
  expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toContain('javascript');
});
test('no sustituye errores API/health/assets ni publica secretos o fuentes', async () => {
  for (const url of ['/api/v1/inexistente', '/health/inexistente', '/assets/missing.js', '/.env', '/package.json', '/src/server.ts']) {
    const response = await frontend.inject({ url, headers: { accept: 'text/html' } });
    expect(response.statusCode).toBe(404); expect(response.json().error.code).toBe('NOT_FOUND');
  }
  expect((await frontend.inject({ method: 'POST', url: '/login' })).statusCode).toBe(404);
  expect(() => registerFrontend(Fastify(), resolve('tmp/missing-frontend'))).toThrow('Falta el frontend compilado');
});
