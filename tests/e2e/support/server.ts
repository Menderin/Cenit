import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createTestPool, closeTestPool } from '../../integration/support/postgres.js';
import { createDemoCredentials, prepareDemoAccounts, prepareDemoStudentAccounts } from '../../../db/seeds/auth-demo.js';
import { buildAcademicApp } from '../../../apps/api/src/app.js';
import { AcademicRepository } from '../../../apps/api/src/modules/academic/repositories/academic.js';
import { AuthRepository } from '../../../apps/api/src/modules/auth/repositories/auth.js';
import { AuthService } from '../../../apps/api/src/modules/auth/services/auth.js';
import { loadCatalog, readCatalog } from '../../../db/seeds/load-academic.js';
import { createAcademicDemoAccounts, academicDemoStudents } from '../../../db/seeds/academic-fixtures.js';
import { seedAcademicDemo } from '../../../db/seeds/academic-demo.js';

process.env.APP_ENV = 'test';
const suffix = randomBytes(6).toString('hex');
const database = `cenit_auth_browser_${suffix}`, migrator = `browser_migrator_${suffix}`, runtime = `browser_runtime_${suffix}`;
const migrationPassword = randomBytes(24).toString('hex'), runtimePassword = randomBytes(24).toString('hex');
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo'); url.username = 'cenit_admin';
  url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString();
})();
const urlFor = (role: string, password: string) => {
  const url = new URL(adminUrl); url.pathname = `/${database}`; url.username = role; url.password = password; return url.toString();
};
const admin = createTestPool({ connectionString: adminUrl });
const root = resolve('tmp/e2e-auth');
const migrationFile = resolve(root, `migration-${suffix}`);
const credentialsFile = resolve(root, 'credentials.json');
let pool: ReturnType<typeof createTestPool> | undefined;
let app: ReturnType<typeof buildAcademicApp> | undefined;
let vite: ChildProcess | undefined;
let closing = false;
let shutdownTimer: ReturnType<typeof setInterval> | undefined;
async function cleanup() {
  if (closing) return; closing = true;
  clearInterval(shutdownTimer);
  if (vite && vite.exitCode === null) {
    const child = vite;
    await new Promise<void>(done => { child.once('exit', () => done()); child.kill('SIGTERM'); });
  }
  if (app) await app.close();
  if (pool) await closeTestPool(pool);
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  for (const role of [runtime, migrator]) await admin.query(`DROP ROLE IF EXISTS ${role}`);
  await closeTestPool(admin);
  rmSync(migrationFile, { force: true }); rmSync(credentialsFile, { force: true });
  writeFileSync(resolve(root, 'stopped'), 'stopped', { mode: 0o600 });
}
async function main() {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  rmSync(resolve(root, 'stop'), { force: true }); rmSync(resolve(root, 'stopped'), { force: true });
  if (!existsSync(resolve('apps/web/dist/index.html'))) throw new Error('missing-web-build');
  await admin.query(`CREATE ROLE ${migrator} LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE ROLE ${runtime} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE DATABASE ${database}`);
  const provisionUrl = new URL(adminUrl); provisionUrl.pathname = `/${database}`;
  const provisioner = createTestPool({ connectionString: provisionUrl.toString() });
  try { await provisioner.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE SCHEMA cenit AUTHORIZATION ${migrator}; GRANT USAGE ON SCHEMA cenit TO ${runtime}`); }
  finally { await closeTestPool(provisioner); }
  const migrationPool = createTestPool({ connectionString: urlFor(migrator, migrationPassword) });
  try { await migrationPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA cenit GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${runtime}`); }
  finally { await closeTestPool(migrationPool); }
  writeFileSync(migrationFile, urlFor(migrator, migrationPassword), { mode: 0o600 });
  execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: migrationFile }, stdio: 'pipe' });
  rmSync(migrationFile);
  const catalogPool = createTestPool({ connectionString: urlFor(migrator, migrationPassword) });
  try { await loadCatalog(catalogPool, readCatalog('catalogs/academic/nutricion-2027-r1.json'), true); }
  finally { await closeTestPool(catalogPool); }
  pool = createTestPool({ connectionString: urlFor(runtime, runtimePassword) });
  const credentials = createDemoCredentials();
  await prepareDemoAccounts(pool, credentials);
  const additional = createAcademicDemoAccounts();
  await prepareDemoStudentAccounts(pool, additional);
  const plan = readCatalog('catalogs/academic/nutricion-2027-r1.json');
  await seedAcademicDemo(pool, plan.planId, plan.version, academicDemoStudents([credentials.find(c => c.role === 'estudiante')!, ...additional], plan));
  writeFileSync(credentialsFile, JSON.stringify(credentials), { mode: 0o600 });
  app = buildAcademicApp({ repository: new AcademicRepository(pool), auth: {
    service: new AuthService(new AuthRepository(pool)), config: { cookieSecure: false, allowedOrigins: ['http://127.0.0.1:5174'] },
  } });
  // Browser scenarios share one proxy IP. Only this disposable server gets a
  // larger budget; integration tests exercise the production ten/minute limit.
  app.addHook('onRoute', route => {
    if (route.url === '/api/v1/auth/login') route.config = { ...route.config, rateLimit: { max: 100, timeWindow: '1 minute' } };
  });
  await app.listen({ host: '127.0.0.1', port: 3173 });
  // Exercise the compiled frontend, including its production asset paths.
  vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', '5174', '--strictPort'], {
    cwd: resolve('apps/web'), env: { ...process.env, CENIT_API_PROXY: 'http://127.0.0.1:3173' }, stdio: 'inherit',
  });
  vite.once('exit', () => { if (!closing) void cleanup().finally(() => { process.exitCode = 1; }); });
  shutdownTimer = setInterval(() => {
    if (existsSync(resolve(root, 'stop'))) void cleanup().catch(() => { console.error('Limpieza de pruebas de navegador fallida.'); process.exitCode = 1; });
  }, 100);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    void cleanup().then(() => { process.exitCode = 0; }).catch(() => { console.error('Limpieza de pruebas de navegador fallida.'); process.exitCode = 1; });
  });
}
main().catch(async error => {
  console.error(error instanceof Error && error.message === 'missing-web-build'
    ? 'Falta el build del frontend. Ejecuta npm run build:web antes de test:e2e:auth.'
    : 'No se pudo preparar la base descartable/API para pruebas de navegador.');
  try { await cleanup(); } catch { console.error('Revisar recursos descartables de esta ejecución.'); }
  process.exitCode = 1;
});
