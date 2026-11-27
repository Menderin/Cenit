// Local development only: PostgreSQL remains managed by Podman Compose.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const children = [];
let stopping = false;
function restoreInput() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  restoreInput();
  process.exitCode = code;
  await Promise.all(children.map(child => new Promise(done => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) { done(); return; }
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); done(); });
    child.kill('SIGTERM');
  })));
}
function start(name, args, cwd, env) {
  // Only the supervisor reads terminal keys, so Vite cannot consume Ctrl+C alone.
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] });
  children.push(child);
  child.once('error', () => { console.error(`No se pudo iniciar ${name}.`); void shutdown(1); });
  child.once('exit', () => {
    if (!stopping) { console.error(`${name} se detuvo; cerrando el entorno de desarrollo.`); void shutdown(1); }
  });
  return child;
}
async function runStep(args, env, failure) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] });
    children.push(child);
    child.once('error', () => reject(new Error(failure)));
    child.once('exit', code => code === 0 ? done() : reject(new Error(failure)));
  });
}
async function freePort(port) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`El puerto ${port} está ocupado o no está disponible. Cierra el proceso que lo usa y vuelve a ejecutar npm run dev.`)));
    server.listen(port, '127.0.0.1', () => server.close(done));
  });
}
async function main() {
  const envFile = resolve(root, '.env'), databaseFile = resolve(root, '.local/secrets/app-local-url');
  if (!existsSync(envFile) || !existsSync(databaseFile)) {
    throw new Error('Falta configuración local. Ejecuta python deploy/scripts/setup-local.py y podman compose up -d db.');
  }
  const local = parseEnv(readFileSync(envFile, 'utf8'));
  const url = new URL(readFileSync(databaseFile, 'utf8').trim());
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.username !== 'cenit_app' || url.pathname !== '/cenit_demo' || Number(url.port) !== Number(local.CENIT_DB_PORT ?? 55432)) {
    throw new Error('La conexión local no corresponde a cenit_app/cenit_demo y al puerto de .env. Repite python deploy/scripts/setup-local.py.');
  }
  await freePort(3000); await freePort(5173);
  const database = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000, statement_timeout: 3000 });
  try {
    await database.connect();
    const result = await database.query("SELECT to_regclass('cenit.accounts') IS NOT NULL AND to_regclass('cenit.sessions') IS NOT NULL AND to_regclass('cenit.purchase_requests') IS NOT NULL AND to_regclass('cenit.purchase_request_lines') IS NOT NULL AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='cenit' AND table_name='purchase_requests' AND column_name IN ('example_id','request_number_search','description_search'))=3 AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='cenit' AND table_name='purchase_request_lines' AND column_name='provider_search') AS ready");
    if (!result.rows[0].ready) throw new Error('missing-migrations');
  } catch (error) {
    // Do not retain a database cause that could expose connection details in CLI output.
    // eslint-disable-next-line preserve-caught-error
    if (error instanceof Error && error.message === 'missing-migrations') throw new Error('Faltan migraciones del proyecto. Sigue la preparación inicial del README (db:migrate).');
    // eslint-disable-next-line preserve-caught-error
    throw new Error('PostgreSQL no está disponible con la conexión local. Ejecuta podman compose up -d db y revisa podman compose ps.');
  } finally { await database.end(); }
  if (stopping) return;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', data => { if (data.includes(3)) void shutdown(); });
  }
  // Override inherited migration credentials/production settings only in these children.
  const env = { ...process.env, APP_ENV: 'development', HOST: '127.0.0.1', PORT: '3000',
    DATABASE_URL_FILE: databaseFile, AUTH_COOKIE_SECURE: 'false',
    AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:5173,http://127.0.0.1:3000,http://localhost:5173,http://localhost:3000',
    CENIT_API_PROXY: 'http://127.0.0.1:3000' };
  for (const key of ['AUTH_GOOGLE_ENABLED', 'AUTH_GOOGLE_CLIENT_ID', 'OCR_URL', 'CAPTURE_RECEIPT_KEY_FILE', 'CENIT_PURCHASE_SHEETS_SYNC_ENABLED', 'CENIT_PURCHASE_SHEETS_ID', 'CENIT_PURCHASE_SHEETS_KEY_FILE']) if (local[key]) env[key] = local[key];
  if (env.OCR_URL) {
    try {
      const response = await fetch(`${env.OCR_URL.replace(/\/$/, '')}/health/live`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok || (await response.json()).status !== 'live') throw new Error('ocr-not-ready');
    } catch {
      throw new Error('OCR_URL está configurado pero el procesador no responde. Inicia el OCR local con docker compose --profile ocr up -d --build ocr y vuelve a ejecutar npm run dev.');
    }
  }
  const passwordKeys = ['CENIT_DEMO_DOCENTE_PASSWORD', 'CENIT_DEMO_ESTUDIANTE_PASSWORD', 'CENIT_DEMO_ADMINISTRATIVO_PASSWORD'];
  const passwords = Object.fromEntries(passwordKeys.map(key => [key, local[key] ?? process.env[key] ?? '']));
  if (passwordKeys.some(key => passwords[key].length < 12 || passwords[key].length > 128)) throw new Error('Configura las tres CENIT_DEMO_*_PASSWORD en el .env privado (12–128 caracteres).');
  console.log('Preparando/verificando las tres cuentas locales de demo…');
  await runStep(['--import', 'tsx', 'db/seeds/auth-demo.ts'], { ...env, ...passwords, APP_ENV: 'demo' }, 'Preparación de cuentas fallida. Revisa las claves privadas existentes y .env; no se cambian contraseñas automáticamente.');
  if (stopping) return;
  for (const key of passwordKeys) delete env[key];
  const contracts = [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'packages/contracts/tsconfig.build.json'];
  console.log('Compilando contratos compartidos…');
  await runStep(contracts, env, 'No se pudieron compilar los contratos compartidos. Corrige los errores antes de iniciar el API.');
  if (stopping) return;
  start('Contratos', [...contracts, '--watch', '--preserveWatchOutput'], root, env);
  console.log('Iniciando API local en http://127.0.0.1:3000…');
  // Windows/OneDrive can emit dependency hydration events while imports are read.
  // Explicit paths keep node_modules out while preserving API/contract reloads.
  const watch = process.platform === 'win32'
    ? ['--watch-path=apps/api/src', '--watch-path=packages/contracts/dist'] : ['--watch'];
  start('API', [...watch, '--watch-preserve-output', '--import', 'tsx', 'apps/api/src/server.ts'], root, env);
  let ready = false;
  for (let i = 0; i < 300 && !stopping; i++) {
    try {
      const response = await fetch('http://127.0.0.1:3000/health/live', { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).status === 'live') { ready = true; break; }
    } catch { /* API is still starting. */ }
    await delay(100);
  }
  if (stopping) return;
  if (!ready) throw new Error('La API no pudo iniciar a tiempo. Revisa su configuración y dependencias.');
  start('Frontend', [resolve(root, 'node_modules/vite/bin/vite.js')], resolve(root, 'apps/web'), env);
  console.log('Abre http://127.0.0.1:5173/login cuando Vite indique que está listo. Ctrl+C cierra API y frontend; PostgreSQL sigue en Podman.');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void shutdown(); });
main().catch(error => {
  console.error(error instanceof Error && !error.message.includes('postgresql://') && !error.message.includes('postgres://') ? error.message : 'No se pudo preparar el entorno local. Revisa .env y los archivos privados.');
  void shutdown(1);
});
