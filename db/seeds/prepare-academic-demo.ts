import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPool, databaseUrl } from '../../apps/api/src/infrastructure/database/connection.js';
import { privateDemoCredentials, prepareDemoStudentAccounts, type DemoCredential } from './auth-demo.js';
import { loadCatalog, readCatalog } from './load-academic.js';
import { createAcademicDemoAccounts, academicDemoStudents } from './academic-fixtures.js';
import { seedAcademicDemo } from './academic-demo.js';

async function main() {
  const normalizeLegacyRuts = process.argv[2] === '--normalize-ruts';
  if (process.argv.length > (normalizeLegacyRuts ? 3 : 2) || (process.argv[2] && !normalizeLegacyRuts) || process.env.APP_ENV !== 'demo') throw new Error('Preparación exclusiva de demostración explícita.');
  if (new URL(databaseUrl()).hostname !== '127.0.0.1') throw new Error('Preparación limitada a PostgreSQL local.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (!existsSync(resolve(root, '.local/secrets/auth-demo.json'))) throw new Error('Prepara primero las cuentas originales de login.');
  const existing = privateDemoCredentials(root).find(c => c.role === 'estudiante')!;
  const file = resolve(root, '.local/secrets/academic-demo-accounts.json');
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('No usar enlaces para credenciales.');
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(createAcademicDemoAccounts(), null, 2), { flag: 'wx', mode: 0o600 });
  const extra: DemoCredential[] = JSON.parse(readFileSync(file, 'utf8'));
  const plan = readCatalog('catalogs/academic/nutricion-diagrama-r2.json');
  const pool = createPool();
  try {
    const target = (await pool.query('SELECT current_database() AS name,current_user AS role')).rows[0];
    if (target.name !== 'cenit_demo' || target.role !== 'cenit_migrator') throw new Error('Usa únicamente cenit_migrator sobre cenit_demo local.');
    const ready = (await pool.query("SELECT to_regclass('cenit.academic_students') IS NOT NULL AND to_regclass('cenit.academic_enrollments') IS NOT NULL AND to_regclass('cenit.academic_attempts') IS NOT NULL AS installed")).rows[0];
    if (!ready.installed) throw new Error('Aplica primero la migración académica.');
    await loadCatalog(pool, plan, true);
    await prepareDemoStudentAccounts(pool, extra);
    await seedAcademicDemo(pool, plan.planId, plan.version, academicDemoStudents([existing, ...extra], plan, normalizeLegacyRuts));
    console.log('Malla publicada y tres perfiles/historiales ficticios preparados. Cuentas originales conservadas; claves adicionales sólo en .local/secrets/academic-demo-accounts.json.');
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.error('Preparación académica fallida. Revisa migración, permisos y cuentas privadas. No se imprimieron credenciales ni se restablecieron registros.'); process.exitCode = 1;
});
