import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Value } from '@sinclair/typebox/value';
import { GoogleChallengeResponseSchema, ProfileResponseSchema, SessionResponseSchema } from '../../packages/contracts/src/auth/index.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { AuthRepository } from '../../apps/api/src/modules/auth/repositories/auth.js';
import { GoogleRepository } from '../../apps/api/src/modules/auth/repositories/google.js';
import { AuthService } from '../../apps/api/src/modules/auth/services/auth.js';
import { GoogleService, googleHash, invalidGoogle } from '../../apps/api/src/modules/auth/services/google.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { configureGoogleAuthorizations } from '../../db/seeds/google-authorizations.js';
import { createTestPool, closeTestPool } from './support/postgres.js';

const suffix = randomBytes(6).toString('hex');
const databases = [`cenit_google_test_${suffix}_existing`, `cenit_google_test_${suffix}_empty`];
const runtimeRole = `google_runtime_${suffix}`, runtimePassword = randomBytes(24).toString('hex');
const adminUrl = process.env.ACADEMIC_TEST_ADMIN_URL_FILE ? readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim() : process.env.DATABASE_URL;
if (!adminUrl) throw new Error('Configura PostgreSQL exclusivo de QA para las pruebas de Google.');
const admin = createTestPool({ connectionString: adminUrl });
const connection = (database: string, runtime = false) => {
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  if (runtime) { url.username = runtimeRole; url.password = runtimePassword; }
  return url.toString();
};
const pools: ReturnType<typeof createTestPool>[] = [];
const credentials = createDemoCredentials();
const origin = 'http://127.0.0.1:3000', clientId = '123-demo.apps.googleusercontent.com';
const account = credentials[0]!;
const identity = { sub: '123456789', email: 'authorized@cenit.invalid' };
let now = new Date('2026-11-07T12:00:00.000Z');
let pool: ReturnType<typeof createTestPool>, auth: AuthService, googleRepo: GoogleRepository;
let app: ReturnType<typeof buildAcademicApp>, oldToken: string;
let counter = 1;
function build(enabled = true) {
  return buildAcademicApp({ repository: new AcademicRepository(pool), auth: { service: auth, config: { allowedOrigins: [origin], cookieSecure: true },
    google: new GoogleService(enabled ? { enabled: true, clientId } : { enabled: false }, googleRepo, auth, async (credential, hash) => {
      const parsed = JSON.parse(credential);
      if (googleHash(parsed.nonce) !== hash) throw invalidGoogle();
      return { sub: parsed.sub, email: parsed.email, pictureUrl: parsed.pictureUrl ?? null };
    }, () => now) } });
}
const request = (url: string, payload?: object, cookie?: string, suppliedOrigin: string | undefined = origin, remoteAddress?: string) => app.inject({
  method: payload ? 'POST' : 'GET', url: `/api/v1/auth${url}`, ...(payload ? { payload } : {}),
  headers: { ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}) }, remoteAddress: remoteAddress ?? `192.0.2.${counter++}`,
});
type Response = Awaited<ReturnType<typeof request>>;
const cookie = (response: Response, name: string) => `${name}=${response.cookies.find(c => c.name === name)!.value}`;
const authorize = (id = account.id, email = identity.email) => configureGoogleAuthorizations(pool, [{ accountId: id, googleEmail: email }], 'authorize');
const local = async (selected = account) => `cenit_session=${(await auth.login({ email: selected.email, password: selected.password })).token}`;
async function challenge(purpose: 'login' | 'link', session?: string) {
  const response = await request('/google/challenge', { purpose }, session);
  expect(response.statusCode).toBe(200);
  expect(Value.Check(GoogleChallengeResponseSchema, response.json())).toBe(true);
  return { nonce: response.json().data.nonce as string, cookie: [session, cookie(response, 'cenit_google_challenge')].filter(Boolean).join('; ') };
}
const complete = (purpose: 'login' | 'link', challenge: { nonce: string; cookie: string }, selected = identity) => request(`/google/${purpose}`, { credential: JSON.stringify({ ...selected, nonce: challenge.nonce }) }, challenge.cookie);
const runMigrator = (url: string) => {
  const dir = resolve('tmp/google-auth-tests', suffix); mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'migration-url'); writeFileSync(file, url, { mode: 0o600 });
  try { execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: file }, stdio: 'pipe' }); }
  finally { unlinkSync(file); }
};
beforeAll(async () => {
  process.env.APP_ENV = 'test';
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  for (const [index, database] of databases.entries()) {
    await admin.query(`CREATE DATABASE ${database}`);
    const owner = createTestPool({ connectionString: connection(database) }); pools.push(owner);
    await owner.query('CREATE SCHEMA cenit');
    if (index === 0) {
      await owner.query('CREATE TABLE cenit.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)');
      for (const file of readMigrationFiles({ migrationsFolder: 'db/migrations' }).slice(0, -1)) {
        for (const statement of file.sql) if (statement.trim()) await owner.query(statement);
        await owner.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [file.hash, file.folderMillis]);
      }
      await prepareDemoAccounts(owner, credentials);
      oldToken = (await new AuthService(new AuthRepository(owner), () => now).login({ email: account.email, password: account.password })).token;
    }
    runMigrator(connection(database)); runMigrator(connection(database));
    await owner.query(`GRANT USAGE ON SCHEMA cenit TO ${runtimeRole}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA cenit TO ${runtimeRole}`);
  }
  pool = createTestPool({ connectionString: connection(databases[0]!, true) }); pools.push(pool);
  auth = new AuthService(new AuthRepository(pool), () => now);
  googleRepo = new GoogleRepository(pool);
  app = build(); await app.ready();
});
afterAll(async () => {
  await app?.close();
  await Promise.all(pools.map(closeTestPool));
  for (const database of databases) await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
  await closeTestPool(admin);
});
beforeEach(async () => {
  now = new Date('2026-11-07T12:00:00.000Z');
  await pool.query('DELETE FROM cenit.google_challenges; DELETE FROM cenit.google_identities; DELETE FROM cenit.google_authorizations');
});
it('migración vacía y existente repetible, sin semillas ni pérdida de sesión local', async () => {
  expect((await pools[1]!.query('SELECT count(*)::int AS n FROM cenit.accounts')).rows[0].n).toBe(0);
  expect((await pools[1]!.query('SELECT count(*)::int AS n FROM cenit.google_authorizations')).rows[0].n).toBe(0);
  expect((await auth.session(oldToken))?.data.account.id).toBe(account.id);
  expect((await pool.query('SELECT authentication_method FROM cenit.sessions WHERE account_id=$1', [account.id])).rows[0].authentication_method).toBe('local');
  expect((await pool.query("SELECT has_schema_privilege(current_user,'cenit','CREATE') AS allowed")).rows[0].allowed).toBe(false);
});
it('disponibilidad, Origin exacto, esquema estricto y límite de intentos', async () => {
  expect((await request('/google')).json()).toEqual({ data: { enabled: true, clientId } });
  expect((await request('/google/challenge', { purpose: 'login' }, undefined, 'https://foreign.invalid')).statusCode).toBe(403);
  expect((await request('/google/challenge', { purpose: 'login', role: 'administrativo' })).statusCode).toBe(400);
  for (let i = 0; i < 10; i++) expect((await request('/google/challenge', { purpose: 'login' }, undefined, origin, '198.51.100.44')).statusCode).toBe(200);
  expect((await request('/google/challenge', { purpose: 'login' }, undefined, origin, '198.51.100.44')).statusCode).toBe(429);
});
it('proveedor apagado no impide el acceso local y no ejecuta Google', async () => {
  const disabled = build(false);
  try {
    expect((await disabled.inject('/api/v1/auth/google')).json()).toEqual({ data: { enabled: false, clientId: null } });
    expect((await disabled.inject({ method: 'POST', url: '/api/v1/auth/google/challenge', headers: { origin }, payload: { purpose: 'login' } })).statusCode).toBe(503);
    expect((await disabled.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: account.email, password: account.password } })).statusCode).toBe(200);
  } finally { await disabled.close(); }
});
it('vincula sólo desde sesión local autorizada, sin cambiar cuenta/contraseña/rol', async () => {
  await authorize();
  expect((await request('/google/challenge', { purpose: 'link' })).statusCode).toBe(401);
  const session = await local();
  const before = (await pool.query('SELECT * FROM cenit.accounts ORDER BY id')).rows;
  const link = await complete('link', await challenge('link', session));
  expect(link.statusCode).toBe(200); expect(link.json()).toEqual({ data: { linked: true } });
  expect((await request('/google/link', undefined, session)).json()).toEqual({ data: { linked: true } });
  expect((await pool.query('SELECT * FROM cenit.accounts ORDER BY id')).rows).toEqual(before);
  expect((await complete('link', await challenge('link', session))).statusCode).toBe(200);
});
it('correo coincidente no crea ni vincula identidades; requiere autorización exacta', async () => {
  const selected = { ...identity, email: account.email };
  await authorize(account.id, selected.email);
  expect((await complete('login', await challenge('login'), selected)).statusCode).toBe(403);
  expect((await complete('link', await challenge('link', await local()), identity)).statusCode).toBe(403);
  expect((await pool.query('SELECT count(*)::int AS n FROM cenit.google_identities')).rows[0].n).toBe(0);
});
it('rechaza vincular un subject declarado sin credencial Google', async () => {
  await authorize();
  const session = await local();
  expect((await request('/google/link', { sub: 'unverified-foreign-sub' }, session)).statusCode).toBe(400);
  expect((await pool.query('SELECT count(*)::int AS n FROM cenit.google_identities')).rows[0].n).toBe(0);
  expect((await request('/session', undefined, session)).statusCode).toBe(200);
});
it('el perfil es privado, conserva foto al vincular y la actualiza al entrar con Google', async () => {
  expect((await request('/profile')).statusCode).toBe(401);
  await authorize();
  const session = await local();
  const initial = await request('/profile', undefined, session);
  expect(Value.Check(ProfileResponseSchema, initial.json())).toBe(true);
  expect(initial.json().data.google).toMatchObject({ linked: false, pictureUrl: null });
  const selected = { ...identity, pictureUrl: 'https://lh3.googleusercontent.com/a/fictitious' };
  expect((await complete('link', await challenge('link', session), selected)).statusCode).toBe(200);
  expect((await request('/profile', undefined, session)).json().data.google).toEqual({ enabled: true, linked: true, email: identity.email, pictureUrl: selected.pictureUrl });
  const other = await local(credentials[1]!);
  expect((await request('/profile', undefined, other)).json().data.google).toMatchObject({ linked: false, pictureUrl: null, email: null });
  const updated = { ...selected, pictureUrl: 'https://lh3.googleusercontent.com/a/updated' };
  const login = await complete('login', await challenge('login'), updated);
  const response = await request('/profile', undefined, cookie(login, 'cenit_session'));
  expect(response.json().data.google.pictureUrl).toBe(updated.pictureUrl);
  await expect(pool.query('UPDATE cenit.google_identities SET picture_url=$2 WHERE account_id=$1', [account.id, 'https://example.invalid/photo'])).rejects.toMatchObject({ code: '23514' });
  expect((await request('/profile', undefined, session)).json().data.google.pictureUrl).toBe(updated.pictureUrl);
});
it('rechaza replay, nonce ajeno, falta de cookie y desafío vencido', async () => {
  const attempt = await challenge('login');
  expect((await request('/google/login', { credential: '{}' })).statusCode).toBe(401);
  expect((await complete('login', { ...attempt, nonce: 'b'.repeat(64) })).statusCode).toBe(401);
  expect((await complete('login', attempt)).statusCode).toBe(401);
  const expired = await challenge('login'); now = new Date(now.getTime() + 300000);
  expect((await complete('login', expired)).statusCode).toBe(401);
});
it('desafío ligado a cuenta/sesión y propósito, incluso después de logout', async () => {
  await authorize();
  const session = await local();
  const attempt = await challenge('link', session);
  expect((await complete('login', attempt)).statusCode).toBe(401);
  const pending = await challenge('link', session);
  await auth.logout(session.split('=')[1]);
  expect((await complete('link', pending)).statusCode).toBe(401);
  const other = await local(credentials[1]!);
  const switched = await challenge('link', await local());
  switched.cookie = switched.cookie.replace(/cenit_session=[^;]+/, other);
  expect((await complete('link', switched)).statusCode).toBe(401);
});
it('dos usos simultáneos del desafío producen una sola vinculación', async () => {
  await authorize();
  const attempt = await challenge('link', await local());
  const responses = await Promise.all([complete('link', attempt), complete('link', attempt)]);
  expect(responses.map(r => r.statusCode).sort()).toEqual([200, 401]);
  expect((await pool.query('SELECT count(*)::int AS n FROM cenit.google_identities')).rows[0].n).toBe(1);
});
it('sub único entre cuentas, vínculos concurrentes y reemplazo rechazado', async () => {
  const other = credentials[1]!;
  await authorize(); await authorize(other.id, 'other@cenit.invalid');
  const results = await Promise.all([
    complete('link', await challenge('link', await local())),
    complete('link', await challenge('link', await local(other)), { ...identity, email: 'other@cenit.invalid' }),
  ]);
  expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
  expect((await pool.query('SELECT count(*)::int AS n FROM cenit.google_identities')).rows[0].n).toBe(1);
});
it('acceso Google rota sesión, conserva rol y vence exactamente a las dos horas sin actividad extensible', async () => {
  await authorize();
  const previous = await local();
  await complete('link', await challenge('link', previous));
  const response = await complete('login', await challenge('login', previous));
  expect(response.statusCode).toBe(200); expect(Value.Check(SessionResponseSchema, response.json())).toBe(true);
  expect(response.headers['cache-control']).toBe('no-store');
  const session = cookie(response, 'cenit_session');
  expect(response.cookies.find(c => c.name === 'cenit_session')).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 7200 });
  expect(response.json().data.account.role).toBe(account.role);
  expect(await auth.session(previous.split('=')[1])).toBeNull();
  expect((await request('/google/challenge', { purpose: 'link' }, session)).statusCode).toBe(401);
  now = new Date(now.getTime() + 7199000); expect((await request('/session', undefined, session)).statusCode).toBe(200);
  now = new Date(now.getTime() + 1000); expect((await request('/session', undefined, session)).statusCode).toBe(401);
});
it('revocar autorización invalida sesiones Google y conserva acceso local', async () => {
  await authorize(); const session = await local();
  await complete('link', await challenge('link', session));
  const google = await complete('login', await challenge('login'));
  await configureGoogleAuthorizations(pool, [{ accountId: account.id, googleEmail: identity.email }], 'revoke');
  expect((await request('/session', undefined, cookie(google, 'cenit_session'))).statusCode).toBe(401);
  expect((await request('/session', undefined, session)).statusCode).toBe(200);
  expect((await complete('login', await challenge('login'))).statusCode).toBe(403);
});
it('los tres roles conservan sus permisos y logout revoca también la sesión Google', async () => {
  for (const [index, selected] of credentials.entries()) {
    const googleIdentity = { sub: `role-${index}`, email: `role-${index}@cenit.invalid` };
    await authorize(selected.id, googleIdentity.email);
    expect((await complete('link', await challenge('link', await local(selected)), googleIdentity)).statusCode).toBe(200);
    const response = await complete('login', await challenge('login'), googleIdentity);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.account).toMatchObject({ id: selected.id, role: selected.role, email: selected.email });
    const session = cookie(response, 'cenit_session');
    const plans = await app.inject({ url: '/api/v1/academic/plans', headers: { cookie: session } });
    expect(plans.statusCode).toBe(selected.role === 'administrativo' ? 403 : 200);
    const logout = await request('/logout', {}, session);
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies.find(c => c.name === 'cenit_google_challenge')).toMatchObject({ maxAge: 0, path: '/api/v1/auth/google' });
    expect((await request('/session', undefined, session)).statusCode).toBe(401);
  }
});
it('FK, correo y subject únicos y desafíos restringidos en PostgreSQL', async () => {
  await expect(pool.query('INSERT INTO cenit.google_authorizations(account_id,email) VALUES($1,$2)', ['ffffffff-ffff-ffff-ffff-ffffffffffff', identity.email])).rejects.toMatchObject({ code: '23503' });
  await expect(pool.query('INSERT INTO cenit.google_authorizations(account_id,email) VALUES($1,$2)', [account.id, 'Upper@cenit.invalid'])).rejects.toMatchObject({ code: '23514' });
  await authorize();
  await expect(authorize(credentials[1]!.id, identity.email)).rejects.toMatchObject({ code: '23505' });
  await expect(pool.query('INSERT INTO cenit.google_identities(account_id,subject) VALUES($1,$2)', [account.id, ''])).rejects.toMatchObject({ code: '23514' });
  await expect(pool.query(`INSERT INTO cenit.google_challenges(token_hash,nonce_hash,purpose,created_at,expires_at)
    VALUES($1,$2,'link',$3,$4)`, ['a'.repeat(64), 'b'.repeat(64), now, new Date(now.getTime() + 300000)])).rejects.toMatchObject({ code: '23514' });
});
it('el comando compilado aplica y revoca el archivo privado explícitamente', async () => {
  const dir = resolve('tmp/google-auth-tests', suffix);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'authorizations.json'), urlFile = resolve(dir, 'operator-url');
  writeFileSync(file, JSON.stringify([{ accountId: account.id, googleEmail: identity.email }]), { mode: 0o600 });
  writeFileSync(urlFile, connection(databases[0]!, true), { mode: 0o600 });
  try {
    for (const action of ['authorize', 'revoke']) {
      const output = execFileSync(process.execPath, ['dist/operations/db/seeds/google-authorizations.js', action, file], {
        env: { ...process.env, DATABASE_URL_FILE: urlFile }, encoding: 'utf8', stdio: 'pipe',
      });
      expect(output).not.toContain(identity.email);
      expect((await pool.query('SELECT count(*)::int AS n FROM cenit.google_authorizations')).rows[0].n).toBe(action === 'authorize' ? 1 : 0);
    }
  } finally { unlinkSync(file); unlinkSync(urlFile); }
});
it('lista blanca transaccional revierte un lote inválido y la cuenta inactiva no entra', async () => {
  await expect(configureGoogleAuthorizations(pool, [{ accountId: account.id, googleEmail: identity.email }, { accountId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', googleEmail: 'other@cenit.invalid' }], 'authorize')).rejects.toThrow();
  expect((await pool.query('SELECT count(*)::int AS n FROM cenit.google_authorizations')).rows[0].n).toBe(0);
  await authorize(); await complete('link', await challenge('link', await local()));
  await pool.query('UPDATE cenit.accounts SET active=false WHERE id=$1', [account.id]);
  try { expect((await complete('login', await challenge('login'))).statusCode).toBe(403); }
  finally { await pool.query('UPDATE cenit.accounts SET active=true WHERE id=$1', [account.id]); }
});
