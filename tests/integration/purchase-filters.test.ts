import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { PurchaseListResponseSchema, type CreatePurchase } from '../../packages/contracts/src/purchases/index.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { buildAcademicApp } from '../../apps/api/src/app.js';
import { AcademicRepository } from '../../apps/api/src/modules/academic/repositories/academic.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { AuthRepository } from '../../apps/api/src/modules/auth/repositories/auth.js';
import { AuthService } from '../../apps/api/src/modules/auth/services/auth.js';

const suffix = randomBytes(6).toString('hex');
const database = `cenit_purchase_filter_test_${suffix}`;
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
const origin = 'http://127.0.0.1:3000';
let adminCookie = '';

function buildPurchase(overrides: {
  requestNumber: string;
  sentDate: string;
  description: string;
  totalAmount: string;
  lines: Array<{ provider: string; unitCode: string; projectCode: string; amount?: string }>;
}): CreatePurchase {
  const base = structuredClone(manualPurchaseExample);
  return {
    ...base,
    operationId: randomUUID(),
    header: {
      ...base.header,
      requestNumber: overrides.requestNumber,
      sentDate: overrides.sentDate,
      description: overrides.description,
      totalAmount: overrides.totalAmount,
    },
    lines: overrides.lines.map(line => ({
      ...structuredClone(base.lines[0]!),
      provider: line.provider,
      unitCode: line.unitCode,
      projectCode: line.projectCode,
      amount: line.amount ?? '50000',
    })),
  };
}

const request = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie: adminCookie, origin },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });

beforeAll(async () => {
  process.env.APP_ENV = 'test';
  await admin.query(`CREATE DATABASE ${database}`);
  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = `/${database}`;
  pool = createTestPool({ connectionString: dbUrl.toString() });
  await pool.query('CREATE SCHEMA cenit');

  const dir = resolve('tmp/purchase-filter-tests', suffix);
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
  app = buildAcademicApp({
    purchaseCapabilities: { secondReviewEnabled: true, sheetsSyncEnabled: false },
    repository: new AcademicRepository(pool),
    purchases: new PurchaseRepository(pool),
    auth: {
      service: new AuthService(new AuthRepository(pool)),
      config: { allowedOrigins: [origin], cookieSecure: false },
    },
  });
  await app.ready();

  const adminAccount = credentials.find(entry => entry.role === 'administrativo')!;
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin },
    payload: { email: adminAccount.email, password: adminAccount.password },
  });
  expect(login.statusCode).toBe(200);
  adminCookie = String(login.headers['set-cookie']).split(';')[0]!;

  // Semilla controlada de 3 solicitudes para probar filtros combinados
  const first = buildPurchase({
    requestNumber: 'FILTRO-001',
    sentDate: '2026-10-10',
    description: 'Adquisición Clínica de Nutrición 100%_\\',
    totalAmount: '120000',
    lines: [
      { provider: 'Distribuidora Árbol Ñandú SpA', unitCode: '002701', projectCode: 'PRJ-01' },
      { provider: 'Insumos Médicos del Sur', unitCode: '002702', projectCode: 'PRJ-02' },
    ],
  });
  const second = buildPurchase({
    requestNumber: 'FILTRO-002',
    sentDate: '2026-10-12',
    description: 'Reactivos de laboratorio docente',
    totalAmount: '80000',
    lines: [
      { provider: 'Proveedor Repetido Norte', unitCode: '002701', projectCode: 'PRJ-01' },
      { provider: 'Proveedor Repetido Norte', unitCode: '002701', projectCode: 'PRJ-01' },
    ],
  });
  const third = buildPurchase({
    requestNumber: 'FILTRO-003',
    sentDate: '2026-10-15',
    description: 'Equipamiento ya validado',
    totalAmount: '50000',
    lines: [{ provider: 'Distribuidora Árbol Ñandú SpA', unitCode: '002701', projectCode: 'PRJ-01' }],
  });

  for (const item of [first, second, third]) {
    const created = await request('POST', '/api/v1/purchases', item);
    expect(created.statusCode).toBe(201);
    if (item.header.requestNumber === 'FILTRO-003') {
      const validated = await request('POST', `/api/v1/purchases/${created.json().data.id}/validation`, { expectedVersion: 1 });
      expect(validated.statusCode).toBe(200);
    }
  }
});

afterAll(async () => {
  if (app) await app.close();
  if (pool) await closeTestPool(pool);
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await closeTestPool(admin);
});

describe('S3-HU06 (Historia 54): búsqueda y filtros de compras', () => {
  it('busca por número, descripción o proveedor ignorando tildes/mayúsculas y tratando %_\\ como literales', async () => {
    for (const term of ['FILTRO-001', 'clinica de nutricion', 'ARBOL NANDU', '100%_\\', '  clinica  ']) {
      const res = await request('GET', `/api/v1/purchases?reviewStatus=pending&q=${encodeURIComponent(term)}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Value.Check(PurchaseListResponseSchema, body)).toBe(true);
      expect(body.data.map((r: { requestNumber: string }) => r.requestNumber)).toEqual(['FILTRO-001']);
      expect(body.totals.documentTotal).toBe('120000');
    }
  });

  it('filtra por rango de fecha de envío inclusivo y ordena por fecha descendente', async () => {
    const both = await request('GET', '/api/v1/purchases?reviewStatus=pending&dateFrom=2026-10-10&dateTo=2026-10-12');
    expect(both.statusCode).toBe(200);
    expect(both.json().data.map((r: { requestNumber: string }) => r.requestNumber)).toEqual(['FILTRO-002', 'FILTRO-001']);
    expect(both.json().totals.documentTotal).toBe('200000');

    const onlyFrom = await request('GET', '/api/v1/purchases?reviewStatus=pending&dateFrom=2026-10-11');
    expect(onlyFrom.json().data.map((r: { requestNumber: string }) => r.requestNumber)).toEqual(['FILTRO-002']);
    expect(onlyFrom.json().totals.documentTotal).toBe('80000');
  });

  it('exige que unitCode y projectCode coincidan en el mismo ítem sin duplicar cabeceras ni totales', async () => {
    // FILTRO-001 tiene ítem 1 (002701 / PRJ-01) e ítem 2 (002702 / PRJ-02); cruzar 002701 con PRJ-02 no debe coincidir
    const crossed = await request('GET', '/api/v1/purchases?reviewStatus=pending&unitCode=002701&projectCode=PRJ-02');
    expect(crossed.statusCode).toBe(200);
    expect(crossed.json().data).toEqual([]);
    expect(crossed.json().pagination.total).toBe(0);
    expect(crossed.json().totals.documentTotal).toBe('0');

    // FILTRO-001 y FILTRO-002 coinciden en (002701 / PRJ-01); FILTRO-002 tiene dos líneas iguales pero suma una sola vez
    const matched = await request('GET', '/api/v1/purchases?reviewStatus=pending&unitCode=002701&projectCode=PRJ-01&pageSize=1&page=1');
    expect(matched.statusCode).toBe(200);
    expect(matched.json().data).toHaveLength(1);
    expect(matched.json().pagination.total).toBe(2);
    expect(matched.json().totals.documentTotal).toBe('200000');

    // El registro validado (FILTRO-003) sólo aparece en reviewStatus=reviewed
    const reviewed = await request('GET', '/api/v1/purchases?reviewStatus=reviewed&unitCode=002701&projectCode=PRJ-01');
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().data.map((r: { requestNumber: string }) => r.requestNumber)).toEqual(['FILTRO-003']);
    expect(reviewed.json().totals.documentTotal).toBe('50000');
  });

  it('rechaza filtros con formato inválido o rango de fechas invertido con HTTP 400', async () => {
    for (const invalidQuery of [
      'q=',
      'q=%20%20%20',
      'dateFrom=2026-02-29',
      'dateFrom=2026-10-15&dateTo=2026-10-10',
      'unitCode=',
      'unknownParam=1',
    ]) {
      const res = await request('GET', `/api/v1/purchases?reviewStatus=pending&${invalidQuery}`);
      expect(res.statusCode).toBe(400);
    }
  });
});
