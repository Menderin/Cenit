import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { CreatePurchase } from '@cenit/contracts/purchases';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { createPool, databaseUrl } from '../../apps/api/src/infrastructure/database/connection.js';
import { PurchaseService } from '../../apps/api/src/modules/purchases/services/purchases.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { privateDemoCredentials } from './auth-demo.js';

// Fictional purchases follow the kinds of spending in the reference sheet. No client
// names, identifiers, institutional codes, or amounts are copied into the demo.
const examples = [
  { date: '2026-10-05', requestNumber: 'CENIT-2026-041', description: 'Servicio de coffee break para una ceremonia académica', amount: '168900', documentType: 'COTIZACIÓN', reviewed: false,
    lines: [{ description: 'Coffee break para asistentes', provider: 'Proveedor ficticio de alimentación', quantity: '30', price: '5630', amount: '168900' }] },
  { date: '2026-10-06', requestNumber: 'CENIT-2026-044', description: 'Alojamiento y aseo para apoyo a práctica rural', amount: '1125400', documentType: 'COTIZACIÓN', reviewed: false,
    lines: [{ description: 'Arriendo de alojamiento', provider: 'Proveedor ficticio de alojamiento', quantity: '1', price: '980000', amount: '980000' },
      { description: 'Servicio de aseo', provider: 'Proveedor ficticio de aseo', quantity: '1', price: '145400', amount: '145400' }] },
  { date: '2026-10-06', requestNumber: 'CENIT-2026-047', description: 'Pasajes para asistencia a una reunión académica regional', amount: '428600', documentType: 'COTIZACIÓN', reviewed: false,
    lines: [{ description: 'Pasaje aéreo ida y regreso', provider: 'Proveedor ficticio de viajes', quantity: '1', price: '428600', amount: '428600' }] },
  { date: '2026-10-08', requestNumber: 'CENIT-2026-050', description: 'Materiales para actividades prácticas de laboratorio', amount: '342800', documentType: 'COTIZACIÓN', reviewed: false,
    lines: [{ description: 'Materiales de laboratorio', provider: 'Proveedor ficticio de insumos', quantity: '4', price: '85700', amount: '342800' }] },
  { date: '2026-10-09', requestNumber: 'CENIT-2026-053', description: 'Impresión de material educativo', amount: '126000', documentType: 'COTIZACIÓN', reviewed: true,
    lines: [{ description: 'Impresión de guías', provider: 'Proveedor ficticio de impresión', quantity: '300', price: '420', amount: '126000' }] },
  { date: '2026-10-07', requestNumber: 'CENIT-2026-057', description: 'Apoyo para una actividad académica', amount: '295000', documentType: 'HONORARIOS', reviewed: true,
    lines: [{ description: 'Apoyo técnico para actividad', provider: 'Prestador ficticio de servicios', quantity: '1', price: '295000', amount: '295000' }] },
  { date: '2026-10-08', requestNumber: 'CENIT-2026-060', description: 'Insumos de oficina para actividades administrativas', amount: '210750', documentType: 'COTIZACIÓN', reviewed: true,
    lines: [{ description: 'Insumos de oficina', provider: 'Proveedor ficticio de artículos de oficina', quantity: '15', price: '14050', amount: '210750' }] },
  { date: '2026-10-09', requestNumber: 'CENIT-2026-063', description: 'Mantención de equipos de apoyo docente', amount: '581900', documentType: 'COTIZACIÓN', reviewed: false,
    lines: [{ description: 'Mantención preventiva', provider: 'Proveedor ficticio de mantención', quantity: '1', price: '390000', amount: '390000' },
      { description: 'Repuestos de equipo', provider: 'Proveedor ficticio de repuestos', quantity: '1', price: '191900', amount: '191900' }] },
] as const;

const historicalCategories = [
  { description: 'Servicio de alimentación para actividad académica', lineDescription: 'Servicio de alimentación', provider: 'Proveedor ficticio de alimentación', documentType: 'COTIZACIÓN', baseAmount: 132000 },
  { description: 'Traslado para práctica en terreno', lineDescription: 'Servicio de traslado', provider: 'Proveedor ficticio de transporte', documentType: 'COTIZACIÓN', baseAmount: 248000 },
  { description: 'Insumos para laboratorio y docencia', lineDescription: 'Insumos de laboratorio', provider: 'Proveedor ficticio de insumos', documentType: 'COTIZACIÓN', baseAmount: 316000 },
  { description: 'Impresión de material educativo', lineDescription: 'Impresión de guías', provider: 'Proveedor ficticio de impresión', documentType: 'COTIZACIÓN', baseAmount: 94500 },
  { description: 'Alojamiento y apoyo logístico para práctica', lineDescription: 'Alojamiento para actividad académica', provider: 'Proveedor ficticio de alojamiento', documentType: 'COTIZACIÓN', baseAmount: 685000 },
  { description: 'Mantención de equipos de apoyo docente', lineDescription: 'Mantención preventiva', provider: 'Proveedor ficticio de mantención', documentType: 'COTIZACIÓN', baseAmount: 427000 },
  { description: 'Apoyo profesional para actividad académica', lineDescription: 'Servicio profesional', provider: 'Prestador ficticio de servicios', documentType: 'HONORARIOS', baseAmount: 295000 },
] as const;

const historicalExamples = [2024, 2025, 2026].flatMap(year => {
  const months = year === 2026 ? 9 : 12;
  return Array.from({ length: months * 2 }, (_, index) => {
    const month = Math.floor(index / 2) + 1, slot = index % 2;
    const category = historicalCategories[(year + month + slot) % historicalCategories.length]!;
    const amount = category.baseAmount + (year - 2024) * 21300 + month * 11750 + slot * 43600;
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${slot === 0 ? '08' : '23'}`,
      requestNumber: `CENIT-${year}-${String(index + 1).padStart(3, '0')}`,
      description: category.description, amount: String(amount), documentType: category.documentType,
      reviewed: (year + month + slot) % 3 === 0,
      lines: [{ description: category.lineDescription, provider: category.provider, quantity: '1', price: String(amount), amount: String(amount) }],
    };
  });
});
const allExamples = [...examples, ...historicalExamples];

function operationId(index: number) {
  return `44444444-4444-4444-8444-000000000${String(index + 1).padStart(3, '0')}`;
}

function registrationDayOffset(index: number) {
  // Spread the fixtures across the 30-day activity chart with a repeatable pattern.
  return (index * 7 + Math.floor(index / 4) * 5) % 30;
}

type SeedRecord = { id: string; operationId: string; requestNumber: string; source: string; exampleId: string | null };

function assertSeedRecord(record: SeedRecord, index: number) {
  if (record.source === 'contract_example') {
    const expectedRequestNumber = `DEMO-COMPRA-${String(index + 1).padStart(3, '0')}`;
    if (record.exampleId === 'recovered' && record.requestNumber === expectedRequestNumber) return;
  } else if (record.source === 'manual' && record.requestNumber === purchaseDemoExamples[index]!.input.header.requestNumber) return;
  throw new Error('La operación reservada para la semilla contiene datos inesperados; no se modificó.');
}

async function setRegistrationDates(pool: Pool, accountId: string, records: Array<SeedRecord & { index: number }>) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const record of records) {
      const result = await db.query(`UPDATE cenit.purchase_requests SET created_at=LEAST(
          (((now() AT TIME ZONE 'America/Santiago')::date - $3::int + time '09:00') + ($4::int * interval '1 minute')) AT TIME ZONE 'America/Santiago', now())
        WHERE id=$1 AND created_by=$2 AND operation_id=$5 AND request_number=$6 AND source=$7`,
      [record.id, accountId, registrationDayOffset(record.index), (record.index * 53) % 480,
        record.operationId, record.requestNumber, record.source]);
      if (result.rowCount !== 1) throw new Error('No se pudo confirmar una fecha de incorporación de demo; no se modificó el conjunto.');
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

export const purchaseDemoExamples = allExamples.map((example, index) => {
  const input: CreatePurchase = structuredClone(manualPurchaseExample);
  input.operationId = operationId(index);
  input.origin = { type: 'manual' };
  input.header = {
    requestNumber: example.requestNumber, oracleId: null, sender: null, recipient: null,
    sentDate: example.date, sentTime: null, description: example.description,
    totalAmount: example.amount, taxAmount: null, attachmentReference: null,
  };
  input.administrative = { document: null, documentType: example.documentType, bi: null, rut: null, unitName: null, item: null, paymentSituation: null };
  input.lines = example.lines.map(line => {
    return {
      ...input.lines[0]!, ...line, costCenter: null, lineUnit: null, chargeAccount: null,
      universityCode: null, campusCode: null, unitCode: null, projectCode: null, accountingCode: null,
    };
  });
  return { input, reviewed: example.reviewed };
});

export async function seedPurchaseDemo(pool: Pool, accountId: string) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Preparación exclusiva de demo/pruebas.');
  const account = (await pool.query("SELECT id FROM cenit.accounts WHERE id=$1 AND role='administrativo' AND active", [accountId])).rows[0];
  if (!account) throw new Error('Se requiere una cuenta administrativa existente y activa.');
  const service = new PurchaseService(new PurchaseRepository(pool), undefined, { secondReviewEnabled: true, sheetsSyncEnabled: false });
  // Replace only the fixed contract examples produced by the previous demo
  // seed. Other purchases and any unexpected reuse of these operation IDs stop here.
  const oldOperationIds = purchaseDemoExamples.map((_, index) => operationId(index));
  const oldRecords = await pool.query<{ id: string; version: number; operationId: string; requestNumber: string; source: string; exampleId: string | null }>(
    `SELECT id,version,operation_id AS "operationId",request_number AS "requestNumber",source,example_id AS "exampleId"
     FROM cenit.purchase_requests WHERE created_by=$1 AND operation_id=ANY($2::uuid[]) ORDER BY operation_id`,
    [accountId, oldOperationIds]);
  const legacyRecords = [];
  for (const record of oldRecords.rows) {
    const index = oldOperationIds.indexOf(record.operationId);
    if (record.source === 'contract_example') {
      if (index < 0) throw new Error('La operación reservada para un ejemplo anterior contiene datos inesperados; no se modificó.');
      assertSeedRecord(record, index);
      legacyRecords.push(record);
    } else if (index < 0) throw new Error('La operación reservada para la semilla contiene datos inesperados; no se modificó.');
    else assertSeedRecord(record, index);
  }

  let replaced = 0;
  for (const record of legacyRecords) {
    await service.delete(record.id, record.version);
    replaced++;
  }

  let created = 0;
  const seededRecords: Array<SeedRecord & { index: number }> = [];
  for (const [index, { input, reviewed }] of purchaseDemoExamples.entries()) {
    const result = await service.create(input, accountId);
    if (result.created) created++;
    if (result.created) seededRecords.push({ id: result.record.id, index, operationId: operationId(index), requestNumber: input.header.requestNumber, source: 'manual', exampleId: null });
    // Repeating a local review preserves its first reviewer, timestamp and version.
    if (reviewed && result.created) await service.validate(result.record.id, result.record.version, accountId);
  }
  await setRegistrationDates(pool, accountId, seededRecords);
  return { created, retained: purchaseDemoExamples.length - created, replaced };
}

export async function spreadExistingPurchaseDemoActivity(pool: Pool, accountId: string) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Preparación exclusiva de demo/pruebas.');
  const account = (await pool.query("SELECT id FROM cenit.accounts WHERE id=$1 AND role='administrativo' AND active", [accountId])).rows[0];
  if (!account) throw new Error('Se requiere una cuenta administrativa existente y activa.');

  const operationIds = purchaseDemoExamples.map((_, index) => operationId(index));
  const existing = await pool.query<SeedRecord>(
    `SELECT id,operation_id AS "operationId",request_number AS "requestNumber",source,example_id AS "exampleId"
     FROM cenit.purchase_requests WHERE created_by=$1 AND operation_id=ANY($2::uuid[]) ORDER BY operation_id`,
    [accountId, operationIds]);
  const records = existing.rows.map(record => {
    const index = operationIds.indexOf(record.operationId);
    if (index < 0) throw new Error('La operación reservada para la semilla contiene datos inesperados; no se modificó.');
    assertSeedRecord(record, index);
    return { ...record, index };
  });
  if (records.length) await setRegistrationDates(pool, accountId, records);
  return { updated: records.length };
}

async function main() {
  const spreadOnly = process.argv[2] === '--spread-activity-only';
  if (process.argv.length > (spreadOnly ? 3 : 2) || (spreadOnly && process.argv[2] !== '--spread-activity-only') || process.env.APP_ENV !== 'demo') {
    throw new Error('Usa purchases:prepare-demo con APP_ENV=demo; --spread-activity-only sólo corrige fechas de los registros ficticios existentes.');
  }
  const url = new URL(databaseUrl());
  if (url.hostname !== '127.0.0.1' || url.username !== 'cenit_migrator' || url.pathname !== '/cenit_demo') throw new Error('Preparación limitada a cenit_migrator sobre cenit_demo local.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (!existsSync(resolve(root, '.local/secrets/auth-demo.json'))) throw new Error('Prepara primero las cuentas originales.');
  const credential = privateDemoCredentials(root).find(account => account.role === 'administrativo')!;
  const pool = createPool();
  try {
    const target = (await pool.query('SELECT current_database() AS name,current_user AS role')).rows[0];
    if (target.name !== 'cenit_demo' || target.role !== 'cenit_migrator') throw new Error('Destino de demostración incompatible.');
    const account = (await pool.query("SELECT id FROM cenit.accounts WHERE id=$1 AND email=$2 AND name=$3 AND role='administrativo' AND active", [credential.id, credential.email, credential.name])).rows[0];
    if (!account) throw new Error('Cuenta privada incompatible; no se modificó.');
    if (spreadOnly) {
      const result = await spreadExistingPurchaseDemoActivity(pool, credential.id);
      console.log(`Fechas de incorporación distribuidas para ${result.updated} compras ficticias existentes. No se modificaron otros registros, cuentas ni claves.`);
    } else {
      const result = await seedPurchaseDemo(pool, credential.id);
      console.log(`Compras ficticias preparadas: ${result.created} nuevas, ${result.retained} conservadas y ${result.replaced} ejemplos antiguos reemplazados. No se modificaron cuentas ni claves.`);
    }
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.error('Preparación de compras fallida. Revisa migraciones, permisos y cuenta privada. Los registros existentes se conservan; repetir retoma la carga sin duplicarlos.'); process.exitCode = 1;
});
