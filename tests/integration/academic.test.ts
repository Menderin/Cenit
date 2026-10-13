import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Value } from '@sinclair/typebox/value';
import { PlanResponseSchema, ProgressResponseSchema, StudentsResponseSchema } from '../../packages/contracts/src/academic/index.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import type { AcademicPrincipal } from '../../apps/api/src/modules/academic/routes/index.js';
import { loadCatalog, readCatalog } from '../../db/seeds/load-academic.js';
import { seedAcademicDemo } from '../../db/seeds/academic-demo.js';
import { createDemoCredentials, prepareDemoAccounts, prepareDemoStudentAccounts } from '../../db/seeds/auth-demo.js';
import { createAcademicDemoAccounts } from '../../db/seeds/academic-fixtures.js';

// Never drop/use a configured application DB. Create fresh, uniquely named DBs and roles.
const suffix = randomBytes(6).toString('hex');
const migrationCount = readMigrationFiles({ migrationsFolder: 'db/migrations' }).length;
const databases = [`cenit_academic_test_${suffix}_empty`, `cenit_academic_test_${suffix}_existing`];
const migratorRole = `academic_migrator_${suffix}`;
const runtimeRole = `academic_runtime_${suffix}`;
const migratorPassword = randomBytes(24).toString('hex');
const runtimePassword = randomBytes(24).toString('hex');
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = readFileSync('.local/secrets/postgres-password', 'utf8').trim();
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo'); url.username = 'cenit_admin'; url.password = password; return url.toString();
})();
const urlFor = (database: string, user: string, password: string) => {
  const url = new URL(adminUrl); url.pathname = `/${database}`; url.username = user; url.password = password; return url.toString();
};
const admin = createTestPool({ connectionString: adminUrl });
const migrationPools: pg.Pool[] = [];
const runtimePools: pg.Pool[] = [];
const urls: string[] = [];
const plan = readCatalog('catalogs/academic/nutricion-2027-r1.json');
const firstStudent = randomUUID(), secondStudent = randomUUID();
const firstAccount = randomUUID(), secondAccount = randomUUID();
const teacherAccount = randomUUID();
let app: ReturnType<typeof buildAcademicApp>;
let repository: AcademicRepository;
let versionId: string;
const attempts = [
  { code: plan.courses[0]!.code, attempt: { attemptNumber: 1, status: 'failed' as const, grade: '3' } },
  { code: plan.courses[0]!.code, attempt: { attemptNumber: 2, status: 'passed' as const, grade: '5,2' } },
  { code: plan.courses[1]!.code, attempt: { attemptNumber: 1, status: 'inProgress' as const, grade: null } },
  { code: plan.courses[2]!.code, attempt: { attemptNumber: 1, status: 'failed' as const, grade: '2,5' } },
];
const tokens: Record<string, AcademicPrincipal> = {
  student: { accountId: firstAccount, role: 'estudiante' }, other: { accountId: secondAccount, role: 'estudiante' },
  teacher: { accountId: teacherAccount, role: 'docente' }, admin: { accountId: randomUUID(), role: 'administrativo' },
};
const request = (url: string, token?: string) => app.inject({ url, headers: token ? { authorization: `Bearer ${token}` } : {} });
const runMigrator = (url: string) => {
  const dir = resolve('tmp/academic-tests', suffix); mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'migration-url'); writeFileSync(file, url, { mode: 0o600 });
  try { execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: file }, stdio: 'pipe' }); }
  finally { unlinkSync(file); }
};

beforeAll(async () => {
  process.env.APP_ENV = 'test';
  await admin.query(`CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  for (const [index, database] of databases.entries()) {
    await admin.query(`CREATE DATABASE ${database}`);
    const databaseAdmin = createTestPool({ connectionString: (() => { const u = new URL(adminUrl); u.pathname = `/${database}`; return u.toString(); })() });
    try {
      await databaseAdmin.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE ${database} TO ${migratorRole}; GRANT CONNECT ON DATABASE ${database} TO ${runtimeRole}; CREATE SCHEMA cenit AUTHORIZATION ${migratorRole}`);
      if (index === 1) {
        await databaseAdmin.query('CREATE TABLE cenit.existing_probe(id integer PRIMARY KEY); INSERT INTO cenit.existing_probe VALUES(42)');
      }
    } finally { await closeTestPool(databaseAdmin); }
    const migrationUrl = urlFor(database, migratorRole, migratorPassword); urls.push(migrationUrl);
    const migrationPool = createTestPool({ connectionString: migrationUrl }); migrationPools.push(migrationPool);
    await migrationPool.query(`ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtimeRole}`);
    runMigrator(migrationUrl); runMigrator(migrationUrl);
    await migrationPool.query(`GRANT USAGE ON SCHEMA cenit TO ${runtimeRole}`);
    runtimePools.push(createTestPool({ connectionString: urlFor(database, runtimeRole, runtimePassword) }));
  }
  await loadCatalog(migrationPools[0]!, plan, true);
  versionId = (await migrationPools[0]!.query<{ id: string }>('SELECT id FROM cenit.academic_versions')).rows[0]!.id;
  const accounts = createDemoCredentials();
  Object.assign(accounts.find(c => c.role === 'estudiante')!, { id: firstAccount, name: 'Alex Demo' });
  accounts.find(c => c.role === 'docente')!.id = teacherAccount;
  await prepareDemoAccounts(migrationPools[0]!, accounts);
  const additional = createAcademicDemoAccounts();
  Object.assign(additional[0]!, { id: secondAccount, name: 'Sam Demo' });
  await prepareDemoStudentAccounts(migrationPools[0]!, additional);
  await seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [
    { id: firstStudent, accountId: firstAccount, name: 'Alex Demo', rut: '20.123.456-5', attempts },
    { id: secondStudent, accountId: secondAccount, name: 'Sam Demo', rut: '21.123.456-3', attempts: [] },
  ]);
  repository = new AcademicRepository(runtimePools[0]!);
  app = buildAcademicApp({ repository, authenticate: async req => tokens[String(req.headers.authorization ?? '').replace('Bearer ', '')] ?? null });
  await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
  await Promise.all([...migrationPools, ...runtimePools].map(pool => closeTestPool(pool)));
  for (const db of databases) {
    // Generated identifiers contain only a fixed prefix and hex; never use user-provided paths/names here.
    await admin.query(`DROP DATABASE IF EXISTS ${db}`);
  }
  await admin.query(`DROP ROLE IF EXISTS ${migratorRole}`);
  await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
  await closeTestPool(admin);
});

describe('migraciones reales PostgreSQL 17', () => {
  it('espera el cierre físico de todas las conexiones antes de limpiar la BD', async () => {
    const applicationName = `cleanup_${suffix}`;
    const pool = createTestPool({ connectionString: urls[0], application_name: applicationName, max: 3 });
    let disconnected = 0;
    pool.on('connect', client => client.once('end', () => { disconnected++; }));
    try {
      await Promise.all(Array.from({ length: 3 }, () => pool.query('SELECT pg_sleep(0.02)')));
      expect(pool.totalCount).toBe(3);
    } finally { await closeTestPool(pool); }
    expect(disconnected).toBe(3);
    expect((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1', [applicationName])).rows[0].n).toBe(0);
  });
  it('prueba versión, repetición, esquema previo y ausencia de semillas automáticas', async () => {
    expect((await admin.query<{ server_version: string }>('SHOW server_version')).rows[0]!.server_version).toMatch(/^17\./);
    expect((await runtimePools[1]!.query('SELECT * FROM cenit.academic_plans')).rows).toHaveLength(0);
    expect((await migrationPools[1]!.query('SELECT count(*)::integer AS n FROM cenit.__drizzle_migrations')).rows[0].n).toBe(migrationCount);
    const u = new URL(adminUrl); u.pathname = `/${databases[1]}`;
    const p = createTestPool({ connectionString: u.toString() });
    try { expect((await p.query('SELECT id FROM cenit.existing_probe')).rows[0].id).toBe(42); }
    finally { await closeTestPool(p); }
    expect((await migrationPools[1]!.query('SELECT count(*)::int AS n FROM cenit.academic_students')).rows[0].n).toBe(0);
    expect((await migrationPools[1]!.query('SELECT count(*)::int AS n FROM cenit.accounts')).rows[0].n).toBe(0);
  });
  it('runtime no tiene permisos de creación', async () => {
    await expect(runtimePools[0]!.query('CREATE TABLE cenit.forbidden_probe(id integer)')).rejects.toMatchObject({ code: '42501' });
  });
  it('migrador opera sin CREATE de base ni superusuario, como en la VM', async () => {
    const result = await migrationPools[0]!.query("SELECT has_database_privilege(current_user,current_database(),'CREATE') AS db_create,has_schema_privilege(current_user,'cenit','CREATE') AS schema_create,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser");
    expect(result.rows[0]).toEqual({ db_create: false, schema_create: true, superuser: false });
  });
  it('rechaza historial de migración alterado sin cambiar el catálogo ni el ledger', async () => {
    const pool = migrationPools[1]!;
    const row = (await pool.query<{ id: number; hash: string }>('SELECT id,hash FROM cenit.__drizzle_migrations ORDER BY created_at LIMIT 1')).rows[0]!;
    await pool.query('UPDATE cenit.__drizzle_migrations SET hash=$1 WHERE id=$2', ['0'.repeat(64), row.id]);
    try {
      expect(() => runMigrator(urls[1]!)).toThrow(/migration failed/i);
      expect((await pool.query('SELECT count(*)::integer AS n FROM cenit.__drizzle_migrations')).rows[0].n).toBe(migrationCount);
      expect((await pool.query('SELECT count(*)::integer AS n FROM cenit.academic_plans')).rows[0].n).toBe(0);
    } finally { await pool.query('UPDATE cenit.__drizzle_migrations SET hash=$1 WHERE id=$2', [row.hash, row.id]); }
  });
  it('carga repetible y concurrente; contenido distinto requiere nueva versión', async () => {
    expect(await Promise.all([loadCatalog(migrationPools[0]!, plan, true), loadCatalog(migrationPools[0]!, plan, true)])).toEqual(['unchanged', 'unchanged']);
    const reordered = structuredClone(plan); reordered.sources.reverse(); reordered.courses.reverse(); reordered.prerequisiteEdges.reverse();
    expect(await loadCatalog(migrationPools[0]!, reordered, true)).toBe('unchanged');
    const changed = structuredClone(plan); changed.courses[0]!.name += ' cambiado';
    await expect(loadCatalog(migrationPools[0]!, changed, true)).rejects.toThrow(/otra versión/);
    expect((await repository.plan(plan.planId, plan.version))!.courses[0]!.name).toBe(plan.courses[0]!.name);
  });
  it.each(['courses', 'sources', 'versions', 'plans', 'edges'])('protege inmutabilidad de %s', async table => {
    const queries: Record<string, string> = {
      courses: "UPDATE cenit.academic_courses SET name='Cambio' WHERE version_id=$1",
      sources: "UPDATE cenit.academic_sources SET title='Cambio' WHERE version_id=$1",
      versions: "UPDATE cenit.academic_versions SET status='draft' WHERE id=$1",
      plans: "UPDATE cenit.academic_plans SET name='Cambio' WHERE id=(SELECT plan_id FROM cenit.academic_versions WHERE id=$1)",
      edges: 'DELETE FROM cenit.academic_prerequisite_edges WHERE version_id=$1',
    };
    await expect(migrationPools[0]!.query(queries[table]!, [versionId])).rejects.toMatchObject({ code: '23514' });
  });
  it('rechaza referencias, SCT y semestres inválidos en borrador', async () => {
    const draft = structuredClone(plan); draft.version = 'constraints-draft'; await loadCatalog(migrationPools[0]!, draft, false);
    const id = (await migrationPools[0]!.query('SELECT id FROM cenit.academic_versions WHERE version=$1', [draft.version])).rows[0].id;
    await expect(migrationPools[0]!.query("UPDATE cenit.academic_courses SET credits=-1 WHERE version_id=$1", [id])).rejects.toMatchObject({ code: '23514' });
    await expect(migrationPools[0]!.query('UPDATE cenit.academic_courses SET semester_end=0 WHERE version_id=$1', [id])).rejects.toMatchObject({ code: '23514' });
    await expect(migrationPools[0]!.query('UPDATE cenit.academic_prerequisite_edges SET from_code=$2 WHERE version_id=$1 AND from_code=$3 AND to_code=$4', [id, 'inexistente', plan.prerequisiteEdges[0]!.fromCode, plan.prerequisiteEdges[0]!.toCode])).rejects.toMatchObject({ code: '23503' });
  });
  it('impide publicar un grafo cíclico introducido por SQL', async () => {
    const draft = structuredClone(plan); draft.version = 'cycle-draft'; await loadCatalog(migrationPools[0]!, draft, false);
    const id = (await migrationPools[0]!.query('SELECT id FROM cenit.academic_versions WHERE version=$1', [draft.version])).rows[0].id;
    const edge = plan.prerequisiteEdges[0]!;
    await migrationPools[0]!.query("INSERT INTO cenit.academic_prerequisite_edges VALUES($1,$2,$3,$4,'pending','Prueba')", [id, edge.toCode, edge.fromCode, edge.sourceId]);
    await expect(migrationPools[0]!.query("UPDATE cenit.academic_versions SET status='published' WHERE id=$1", [id])).rejects.toMatchObject({ code: '23514' });
  });
});
describe('historial migrado con FK real a cuentas de login', () => {
  it('corrige sólo el RUT ficticio anterior indicado explícitamente y conserva el historial', async () => {
    const student = { id: firstStudent, accountId: firstAccount, name: 'Alex Demo', rut: '20.123.456-5', attempts };
    await migrationPools[0]!.query("UPDATE cenit.academic_students SET rut='00.000.001-k',rut_search='00000001-K' WHERE id=$1", [firstStudent]);
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [student])).rejects.toThrow('Perfil existente distinto');
    // A later failure rolls the correction back along with the rest of preparation.
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ ...student, legacyRut: '00.000.001-k', attempts: [{ code: plan.courses[0]!.code, attempt: { attemptNumber: 2, status: 'passed', grade: '7' } }] }])).rejects.toThrow('Intento existente distinto');
    expect((await repository.progress(firstStudent))!.data.student.rut).toBe('00.000.001-k');
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ ...student, legacyRut: 'otro' }])).rejects.toThrow('Perfil existente distinto');
    await Promise.all([1, 2].map(() => seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ ...student, legacyRut: '00.000.001-k' }])));
    const corrected = (await repository.progress(firstStudent))!.data;
    expect(corrected.student.rut).toBe(student.rut);
    expect(corrected.courses[0]).toMatchObject({ attemptCount: 2, passingGrade: '5,2' });
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ ...student, rut: '20.123.456-4' }])).rejects.toThrow('RUT de demostración inválido');
  });
  it('preparación repetida/concurrente conserva perfiles e intentos y rechaza sobrescritura', async () => {
    const student = { id: firstStudent, accountId: firstAccount, name: 'Alex Demo', rut: '20.123.456-5', attempts };
    await Promise.all([seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [student]), seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [student])]);
    expect((await repository.progress(firstStudent))!.data.courses[0]!.attemptCount).toBe(2);
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ ...student, attempts: [{ code: plan.courses[0]!.code, attempt: { attemptNumber: 2, status: 'passed', grade: '7' } }] }])).rejects.toThrow('Intento existente distinto');
    expect((await repository.progress(firstStudent))!.data.courses[0]!.passingGrade).toBe('5,2');
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ ...student, id: randomUUID(), accountId: teacherAccount, rut: '22.123.456-1' }])).rejects.toThrow('cuenta estudiantil');
  });
  it('conserva los cuatro estados y la nota de aprobación', async () => {
    const result = await repository.progress(firstStudent);
    expect(Value.Check(ProgressResponseSchema, result)).toBe(true);
    expect(result!.data.courses.slice(0, 4)).toMatchObject([
      { status: 'passed', attemptCount: 2, passingGrade: '5,2' }, { status: 'inProgress', attemptCount: 1, passingGrade: null },
      { status: 'failed', attemptCount: 1, passingGrade: null }, { status: 'notTaken', attemptCount: 0, passingGrade: null },
    ]);
    expect(result!.data.student.rut).toBe('20.123.456-5');
  });
  it.each([['passed', null], ['passed', '3.99'], ['failed', '4.00'], ['failed', '0.99'], ['inProgress', '5.00'], ['invalid', null], ['passed', '6.55']])('rechaza estado/nota %s / %s', async (status, grade) => {
    const enrollmentId = (await migrationPools[0]!.query('SELECT id FROM cenit.academic_enrollments WHERE student_id=$1', [firstStudent])).rows[0].id;
    await expect(migrationPools[0]!.query('INSERT INTO cenit.academic_attempts VALUES($1,$2,$3,$4,99,$5,$6)', [randomUUID(), enrollmentId, versionId, plan.courses[3]!.code, status, grade])).rejects.toMatchObject({ code: '23514' });
  });
  it('serializa coma decimal y oculta el cero final desde PostgreSQL', async () => {
    const enrollmentId = (await migrationPools[0]!.query('SELECT id FROM cenit.academic_enrollments WHERE student_id=$1', [secondStudent])).rows[0].id;
    await migrationPools[0]!.query("INSERT INTO cenit.academic_attempts VALUES($1,$2,$3,$4,1,'passed',6.0),($5,$2,$3,$6,1,'passed',6.5),($7,$2,$3,$8,1,'passed',4.1)", [randomUUID(), enrollmentId, versionId, plan.courses[0]!.code, randomUUID(), plan.courses[1]!.code, randomUUID(), plan.courses[2]!.code]);
    const response = await request('/api/v1/academic/me/progress', 'other');
    expect(response.statusCode).toBe(200);
    expect(response.json().data.courses.slice(0, 3).map((course: { passingGrade: string }) => course.passingGrade)).toEqual(['6', '6,5', '4,1']);
    expect(Value.Check(ProgressResponseSchema, response.json())).toBe(true);
  });
  it('rechaza intento en curso duplicado y asignatura de otra versión', async () => {
    const enrollmentId = (await migrationPools[0]!.query('SELECT id FROM cenit.academic_enrollments WHERE student_id=$1', [firstStudent])).rows[0].id;
    await expect(migrationPools[0]!.query("INSERT INTO cenit.academic_attempts VALUES($1,$2,$3,$4,2,'inProgress',NULL)", [randomUUID(), enrollmentId, versionId, plan.courses[1]!.code])).rejects.toMatchObject({ code: '23505' });
    const draftId = (await migrationPools[0]!.query("SELECT id FROM cenit.academic_versions WHERE version='constraints-draft'")).rows[0].id;
    await expect(migrationPools[0]!.query("INSERT INTO cenit.academic_attempts VALUES($1,$2,$3,$4,1,'passed',5)", [randomUUID(), enrollmentId, draftId, plan.courses[3]!.code])).rejects.toMatchObject({ code: '23503' });
  });
  it('impide duplicar número de intento y crear un perfil sin cuenta', async () => {
    const enrollmentId = (await migrationPools[0]!.query('SELECT id FROM cenit.academic_enrollments WHERE student_id=$1', [firstStudent])).rows[0].id;
    await expect(migrationPools[0]!.query("INSERT INTO cenit.academic_attempts VALUES($1,$2,$3,$4,1,'failed',3)", [randomUUID(), enrollmentId, versionId, plan.courses[0]!.code])).rejects.toMatchObject({ code: '23505' });
    await expect(migrationPools[0]!.query('INSERT INTO cenit.academic_students VALUES($1,$2,$3,$4,$5)', [randomUUID(), randomUUID(), 'Demo inexistente', '00.000.009-0', '00000009-0'])).rejects.toMatchObject({ code: '23503' });
  });
  it('semilla fallida no deja un estudiante parcialmente guardado', async () => {
    const id = randomUUID(); const account = randomUUID();
    await migrationPools[0]!.query("INSERT INTO cenit.accounts(id,email,name,role,password_hash) SELECT $1,$2,'Demo rollback','estudiante',password_hash FROM cenit.accounts WHERE id=$3", [account, `${account}@cenit.invalid`, secondAccount]);
    await expect(seedAcademicDemo(migrationPools[0]!, plan.planId, plan.version, [{ id, accountId: account, name: 'Demo rollback', rut: '22.123.456-1', attempts: [{ code: 'ausente', attempt: { attemptNumber: 1, status: 'passed', grade: '5' } }] }])).rejects.toThrow();
    expect((await runtimePools[0]!.query('SELECT id FROM cenit.academic_students WHERE id=$1', [id])).rows).toHaveLength(0);
  });
});
describe('API con identidad simulada únicamente en el harness de pruebas', () => {
  it('por defecto no acepta identidad enviada por el cliente', async () => {
    const closed = buildAcademicApp({ repository });
    try { expect((await closed.inject({ url: '/api/v1/academic/plans?role=docente', headers: { authorization: 'Bearer teacher' } })).statusCode).toBe(401); }
    finally { await closed.close(); }
  });
  it('docentes y estudiantes leen el catálogo; administrativo y anónimo no', async () => {
    for (const role of ['teacher', 'student']) {
      const response = await request(`/api/v1/academic/plans/${plan.planId}/versions/${plan.version}`, role);
      expect(response.statusCode).toBe(200); expect(Value.Check(PlanResponseSchema, response.json())).toBe(true);
    }
    expect((await request('/api/v1/academic/plans', 'admin')).statusCode).toBe(403);
    expect((await request('/api/v1/academic/plans')).statusCode).toBe(401);
  });
  it('estudiante sólo obtiene su historial y no consulta al otro', async () => {
    expect((await request('/api/v1/academic/me/progress', 'student')).json().data.student.id).toBe(firstStudent);
    expect((await request('/api/v1/academic/me/progress', 'other')).json().data.student.id).toBe(secondStudent);
    expect((await request(`/api/v1/academic/students/${secondStudent}/progress`, 'student')).statusCode).toBe(403);
    expect((await request('/api/v1/academic/students', 'student')).statusCode).toBe(403);
    expect((await request('/api/v1/academic/me/progress', 'teacher')).statusCode).toBe(403);
  });
  it('docente consulta todos los ficticios y combina filtros de nombre/RUT', async () => {
    const response = await request('/api/v1/academic/students?name=Alex&rut=201234565', 'teacher');
    expect(response.statusCode).toBe(200); expect(Value.Check(StudentsResponseSchema, response.json())).toBe(true);
    expect(response.json().data).toHaveLength(1);
    expect((await request('/api/v1/academic/students?name=Sam&rut=201234565', 'teacher')).json().data).toHaveLength(0);
    expect((await request(`/api/v1/academic/students/${secondStudent}/progress`, 'teacher')).statusCode).toBe(200);
  });
  it('paginación, filtros literales y casos vacíos', async () => {
    const response = await request('/api/v1/academic/students?page=2&pageSize=1', 'teacher');
    expect(response.json()).toMatchObject({ page: 2, pageSize: 1, totalItems: 2 }); expect(response.json().data).toHaveLength(1);
    expect((await request('/api/v1/academic/students?name=%25', 'teacher')).json().data).toHaveLength(0);
    expect((await request('/api/v1/academic/students?name=%27%20OR%201%3D1--', 'teacher')).json().data).toHaveLength(0);
  });
  it('busca prefijos de RUT con y sin puntos, combinados con nombre', async () => {
    for (const rut of ['2', '20', '20.123', '20123456', '20.123.456-5']) {
      const response = await request(`/api/v1/academic/students?name=Alex&rut=${encodeURIComponent(rut)}`, 'teacher');
      expect(response.statusCode).toBe(200);
      expect(response.json().data.map((student: { id: string }) => student.id)).toEqual([firstStudent]);
    }
    expect((await request('/api/v1/academic/students?rut=2', 'teacher')).json().totalItems).toBe(2);
  });
  it.each(['page=0', 'page=1.5', 'pageSize=101', 'role=docente', 'name=', 'rut=x', 'rut=20.123.456-4', 'rut=201234564', 'rut=20-1', 'rut=.', 'rut=0'])('rechaza filtro inválido %s', async query => {
    const response = await request(`/api/v1/academic/students?${query}`, 'teacher');
    expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
  it('inexistentes, parámetros inválidos y errores sin trazas internas', async () => {
    expect((await request(`/api/v1/academic/students/${randomUUID()}/progress`, 'teacher')).statusCode).toBe(404);
    expect((await request('/api/v1/academic/students/invalido/progress', 'teacher')).statusCode).toBe(400);
    const response = await request('/api/v1/academic/plans/ausente/versions/v1', 'teacher');
    expect(response.statusCode).toBe(404); expect(response.json().error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toMatch(/stack|SELECT|password/i);
  });
  it('historial no instalado produce 503, sin revelar SQL', async () => {
    await migrationPools[1]!.query('ALTER TABLE cenit.academic_students RENAME TO academic_students_unavailable');
    const pending = buildAcademicApp({ repository: new AcademicRepository(runtimePools[1]!), authenticate: async () => tokens.teacher! });
    try { const response = await pending.inject({ url: '/api/v1/academic/students' }); expect(response.statusCode).toBe(503); expect(response.body).not.toMatch(/academic_students|SELECT|stack/i); }
    finally { await pending.close(); await migrationPools[1]!.query('ALTER TABLE cenit.academic_students_unavailable RENAME TO academic_students'); }
  });
  it('no hay endpoints públicos de escritura', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/academic/students', payload: {}, headers: { authorization: 'Bearer teacher' } })).statusCode).toBe(404);
  });
});
