import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import {
  PlanResponseSchema,
  PlansResponseSchema,
  ProgressResponseSchema,
  type AcademicPlan,
} from '../../packages/contracts/src/academic/index.js';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { loadCatalog, readCatalog } from '../../db/seeds/load-academic.js';
import { seedAcademicDemo } from '../../db/seeds/academic-demo.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { canonicalJson } from '../../apps/api/src/modules/academic/services/catalog.js';
import { AuthRepository } from '../../apps/api/src/modules/auth/repositories/auth.js';
import { AuthService } from '../../apps/api/src/modules/auth/services/auth.js';
import { courseRelations } from '../../apps/web/src/features/academic/model/course-relations.js';
import { groupBySemester } from '../../apps/web/src/features/academic/model/group-by-semester.js';

const suffix = randomBytes(6).toString('hex');
const database = `cenit_academic_curriculum_test_${suffix}`;
const adminUrl = (() => {
  if (process.env.ACADEMIC_TEST_ADMIN_URL_FILE) return readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgres://127.0.0.1:55432/cenit_demo');
  url.username = 'cenit_admin';
  url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim();
  return url.toString();
})();

const admin = createTestPool({ connectionString: adminUrl });
let pool: ReturnType<typeof createTestPool>;
let app: ReturnType<typeof buildAcademicApp>;
const credentials = createDemoCredentials();
const catalogPlan = readCatalog('catalogs/academic/nutricion-diagrama-r2.json');
const studentId = randomUUID();
const origin = 'http://127.0.0.1:3000';
let teacherCookie = '';
let studentCookie = '';

const requestAs = (cookie: string, url: string) =>
  app.inject({
    method: 'GET',
    url,
    headers: { cookie, origin },
  });

beforeAll(async () => {
  process.env.APP_ENV = 'test';
  await admin.query(`CREATE DATABASE ${database}`);
  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = `/${database}`;
  pool = createTestPool({ connectionString: dbUrl.toString() });
  await pool.query('CREATE SCHEMA cenit');

  const dir = resolve('tmp/academic-curriculum-tests', suffix);
  mkdirSync(dir, { recursive: true });
  const migrationUrlFile = resolve(dir, 'migration-url');
  writeFileSync(migrationUrlFile, dbUrl.toString(), { mode: 0o600 });
  try {
    execFileSync(process.execPath, ['deploy/migrate.cjs'], {
      env: { ...process.env, DATABASE_URL_FILE: migrationUrlFile },
      stdio: 'pipe',
    });
  } finally {
    unlinkSync(migrationUrlFile);
  }

  await prepareDemoAccounts(pool, credentials);
  await loadCatalog(pool, catalogPlan, true);

  const studentAccount = credentials.find(entry => entry.role === 'estudiante')!;
  const teacherAccount = credentials.find(entry => entry.role === 'docente')!;

  await seedAcademicDemo(pool, catalogPlan.planId, catalogPlan.version, [
    {
      id: studentId,
      accountId: studentAccount.id,
      name: studentAccount.name,
      rut: '20.123.456-5',
      attempts: [
        { code: 'NUT2027-001', attempt: { attemptNumber: 1, status: 'passed', grade: '5,8' } },
        { code: 'NUT2027-008', attempt: { attemptNumber: 1, status: 'inProgress', grade: null } },
        { code: 'NUT2027-002', attempt: { attemptNumber: 1, status: 'failed', grade: '3,2' } },
      ],
    },
  ]);

  app = buildAcademicApp({
    repository: new AcademicRepository(pool),
    auth: {
      service: new AuthService(new AuthRepository(pool)),
      config: { allowedOrigins: [origin], cookieSecure: false },
    },
  });
  await app.ready();

  for (const [role, account] of [
    ['docente', teacherAccount],
    ['estudiante', studentAccount],
  ] as const) {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email: account.email, password: account.password },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    if (role === 'docente') teacherCookie = cookie;
    else studentCookie = cookie;
  }
});

afterAll(async () => {
  if (app) await app.close();
  if (pool) await closeTestPool(pool);
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await closeTestPool(admin);
});

describe('SCRUM-70 / SCRUM-76: verificación curricular y recorrido de datos ficticios en la malla', () => {
  it('refleja una fila insertada en PostgreSQL dentro de las asignaturas y dependencias del programa en la malla', async () => {
    const versionName = 'ficticia-db-row';
    const versionId = randomUUID();
    const sourceId = 'fuente-ficticia-qa';
    const sourceRow = {
      sourceId,
      title: 'Malla ficticia QA para prueba de dependencias desde BD',
      reference: 'Docs/COTEJO-CATALOGO-ACADEMICO.md',
      sha256: 'a'.repeat(64),
      reviewedAt: '2026-10-27',
      validationStatus: 'example' as const,
    };

    const courses = [
      {
        code: 'FIC-101',
        codeKind: 'internal' as const,
        officialCode: null,
        name: 'Química General Ficticia',
        semester: 1,
        semesterEnd: 1,
        credits: 6,
        displayOrder: 1,
        prerequisites: { kind: 'pending' as const, description: 'Pendiente de confirmación en primer semestre.' },
      },
      {
        code: 'FIC-201',
        codeKind: 'internal' as const,
        officialCode: null,
        name: 'Bioquímica Nutricional Ficticia',
        semester: 2,
        semesterEnd: 2,
        credits: 6,
        displayOrder: 2,
        prerequisites: { kind: 'course' as const, code: 'FIC-101' },
      },
      {
        code: 'FIC-301',
        codeKind: 'internal' as const,
        officialCode: null,
        name: 'Fisiopatología y Dietoterapia Ficticia',
        semester: 3,
        semesterEnd: 3,
        credits: 7,
        displayOrder: 3,
        prerequisites: { kind: 'course' as const, code: 'FIC-201' },
      },
    ];

    const edges = [
      {
        fromCode: 'FIC-101',
        toCode: 'FIC-201',
        sourceId,
        interpretation: 'confirmed' as const,
        note: 'Dependencia directa insertada en BD.',
      },
      {
        fromCode: 'FIC-201',
        toCode: 'FIC-301',
        sourceId,
        interpretation: 'confirmed' as const,
        note: 'Dependencia encadenada insertada en BD.',
      },
    ];

    const contentHash = createHash('sha256')
      .update(
        canonicalJson({
          planId: catalogPlan.planId,
          version: versionName,
          name: catalogPlan.name,
          isExample: true,
          source: sourceRow,
          sources: [sourceRow],
          courses,
          prerequisiteEdges: edges,
        }),
      )
      .digest('hex');

    await pool.query(
      'INSERT INTO cenit.academic_versions(id, plan_id, version, status, is_example, content_hash) VALUES ($1, $2, $3, $4, $5, $6)',
      [versionId, catalogPlan.planId, versionName, 'draft', true, contentHash],
    );
    await pool.query(
      'INSERT INTO cenit.academic_sources(version_id, id, title, reference, sha256, reviewed_at, validation_status, is_primary) VALUES ($1, $2, $3, $4, $5, $6, $7, true)',
      [versionId, sourceRow.sourceId, sourceRow.title, sourceRow.reference, sourceRow.sha256, sourceRow.reviewedAt, sourceRow.validationStatus],
    );

    for (const course of courses) {
      await pool.query(
        'INSERT INTO cenit.academic_courses(version_id, code, official_code, name, semester, semester_end, credits, display_order, prerequisites) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          versionId,
          course.code,
          course.officialCode,
          course.name,
          course.semester,
          course.semesterEnd,
          course.credits.toFixed(2),
          course.displayOrder,
          JSON.stringify(course.prerequisites),
        ],
      );
    }

    for (const edge of edges) {
      await pool.query(
        'INSERT INTO cenit.academic_prerequisite_edges(version_id, from_code, to_code, source_id, interpretation, note) VALUES ($1, $2, $3, $4, $5, $6)',
        [versionId, edge.fromCode, edge.toCode, edge.sourceId, edge.interpretation, edge.note],
      );
    }

    await pool.query("UPDATE cenit.academic_versions SET status = 'published' WHERE id = $1", [versionId]);

    for (const cookie of [studentCookie, teacherCookie]) {
      const plansRes = await requestAs(cookie, '/api/v1/academic/plans');
      expect(plansRes.statusCode).toBe(200);
      expect(Value.Check(PlansResponseSchema, plansRes.json())).toBe(true);
      expect(plansRes.json().data[0].versions).toContainEqual({ version: versionName, isExample: true });

      const versionRes = await requestAs(cookie, `/api/v1/academic/plans/${catalogPlan.planId}/versions/${versionName}`);
      expect(versionRes.statusCode).toBe(200);
      const body = versionRes.json();
      expect(Value.Check(PlanResponseSchema, body)).toBe(true);

      const retrievedPlan: AcademicPlan = body.data;
      expect(retrievedPlan.courses.map(c => c.code)).toEqual(['FIC-101', 'FIC-201', 'FIC-301']);
      expect(retrievedPlan.prerequisiteEdges).toEqual(edges);

      const bioquimica = retrievedPlan.courses.find(c => c.code === 'FIC-201')!;
      expect(bioquimica.prerequisites).toEqual({ kind: 'course', code: 'FIC-101' });

      const groups = groupBySemester(retrievedPlan.courses);
      expect(groups.map(g => ({ semester: g.semester, codes: g.courses.map(c => c.code) }))).toEqual([
        { semester: 1, codes: ['FIC-101'] },
        { semester: 2, codes: ['FIC-201'] },
        { semester: 3, codes: ['FIC-301'] },
      ]);

      const relationsFromFirst = courseRelations(retrievedPlan, 'FIC-101');
      expect([...relationsFromFirst.entries()]).toEqual([
        ['FIC-201', { depth: 1, via: 'FIC-101' }],
        ['FIC-301', { depth: 2, via: 'FIC-201' }],
      ]);
    }
  });

  it('contrasta las respuestas de docente y estudiante con el catálogo versionado diagrama-r2 y sus dependencias', async () => {
    const teacherRes = await requestAs(teacherCookie, `/api/v1/academic/plans/${catalogPlan.planId}/versions/${catalogPlan.version}`);
    const studentRes = await requestAs(studentCookie, `/api/v1/academic/plans/${catalogPlan.planId}/versions/${catalogPlan.version}`);
    expect(teacherRes.statusCode).toBe(200);
    expect(studentRes.statusCode).toBe(200);
    expect(teacherRes.json()).toEqual(studentRes.json());

    const plan: AcademicPlan = studentRes.json().data;
    expect(plan.courses).toHaveLength(52);
    expect(plan.courses.reduce((acc, c) => acc + (c.credits ?? 0), 0)).toBe(305);
    expect(plan.prerequisiteEdges).toHaveLength(43);
    expect(plan.courses.filter(c => c.prerequisites.kind === 'course')).toHaveLength(26);
    expect(plan.courses.filter(c => c.prerequisites.kind === 'allOf')).toHaveLength(8);
    expect(plan.courses.filter(c => c.prerequisites.kind === 'pending')).toHaveLength(18);

    // Recorrido de dependencias desde NUT2027-001 en la zona de malla curricular
    const chainFrom001 = courseRelations(plan, 'NUT2027-001');
    expect(chainFrom001.get('NUT2027-008')).toEqual({ depth: 1, via: 'NUT2027-001' });
    expect(chainFrom001.get('NUT2027-013')).toEqual({ depth: 2, via: 'NUT2027-008' });
    expect(chainFrom001.get('NUT2027-014')).toEqual({ depth: 2, via: 'NUT2027-008' });
    expect(chainFrom001.get('NUT2027-044')).toEqual({ depth: 7, via: 'NUT2027-038' });

    // Reglas conjuntas aclaradas y estados pendientes conservados sin inferir ausencia
    const aps = plan.courses.find(c => c.code === 'NUT2027-035')!;
    expect(aps.prerequisites).toEqual({
      kind: 'allOf',
      rules: [
        { kind: 'course', code: 'NUT2027-027' },
        { kind: 'course', code: 'NUT2027-028' },
      ],
    });
    const internadoAps = plan.courses.find(c => c.code === 'NUT2027-051')!;
    expect(internadoAps.prerequisites).toEqual({ kind: 'course', code: 'NUT2027-046' });
    const internadoClinico = plan.courses.find(c => c.code === 'NUT2027-049')!;
    expect(internadoClinico.prerequisites.kind).toBe('pending');

    // Avance curricular ficticio visto por estudiante y por docente sobre la misma versión
    const ownProgress = await requestAs(studentCookie, '/api/v1/academic/me/progress');
    const teacherProgress = await requestAs(teacherCookie, `/api/v1/academic/students/${studentId}/progress`);
    expect(ownProgress.statusCode).toBe(200);
    expect(teacherProgress.statusCode).toBe(200);
    expect(Value.Check(ProgressResponseSchema, ownProgress.json())).toBe(true);
    expect(ownProgress.json()).toEqual(teacherProgress.json());
    expect(ownProgress.json().data.courses.slice(0, 3)).toMatchObject([
      { code: 'NUT2027-001', status: 'passed', passingGrade: '5,8' },
      { code: 'NUT2027-002', status: 'failed', passingGrade: null },
      { code: 'NUT2027-003', status: 'notTaken', passingGrade: null },
    ]);
  });
});
