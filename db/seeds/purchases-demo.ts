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

// Fictional examples only. Stable operations preserve copies and later reviews on repeat runs.
const examples = [
  ['2026-10-05', 'Materiales de oficina', '180000', 'COTIZACIÓN', '270101', '00000000', false],
  ['2026-10-06', 'Mantención de equipos', '440000', 'HONORARIOS', '270101', '0 0000000', false],
  ['2026-10-06', 'Insumos para actividades prácticas', '260000', 'COTIZACIÓN', '270102', '000DEMO', false],
  ['2026-10-08', 'Equipamiento de apoyo docente', '350000', 'COTIZACIÓN', '270102', '00000000', false],
  ['2026-10-09', 'Servicio de apoyo a jornada', '280000', 'HONORARIOS', '270101', '000DEMO', false],
  ['2026-10-07', 'Materiales de laboratorio', '120000', 'COTIZACIÓN', '270102', '000DEMO', true],
  ['2026-10-08', 'Impresión de material educativo', '90000', 'COTIZACIÓN', '270101', '00000000', true],
  ['2026-10-09', 'Apoyo técnico para taller', '75000', 'HONORARIOS', '270102', '0 0000000', true],
] as const;

export const purchaseDemoExamples = examples.map(([date, description, amount, documentType, unitCode, projectCode, reviewed], index) => {
  const input: CreatePurchase = structuredClone(manualPurchaseExample);
  const number = String(index + 1).padStart(3, '0');
  input.operationId = `44444444-4444-4444-8444-000000000${number}`;
  input.origin = { type: 'contract_example', exampleId: 'recovered' };
  input.header = { ...input.header, requestNumber: `DEMO-COMPRA-${number}`, oracleId: null, sender: 'Solicitante Demo', recipient: 'Administrativo Demo', sentDate: date, description, totalAmount: amount, attachmentReference: null };
  input.administrative = { ...input.administrative, document: 'Documento de demostración', documentType, unitName: `Unidad Demo ${unitCode}` };
  input.lines = input.lines.slice(0, index % 2 === 0 ? 2 : 1).map((line, position, lines) => {
    const lineAmount = String(BigInt(amount) / BigInt(lines.length));
    return { ...line, description: `${description} · ítem ${position + 1}`, provider: position ? 'Proveedor Demo B' : 'Proveedor Demo A', costCenter: 'Centro de costos de demostración', quantity: '1', price: lineAmount, amount: lineAmount, unitCode, projectCode, accountingCode: '420000', chargeAccount: `01.02.${unitCode}.${projectCode}.420000` };
  });
  return { input, reviewed };
});

export async function seedPurchaseDemo(pool: Pool, accountId: string) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Preparación exclusiva de demo/pruebas.');
  const account = (await pool.query("SELECT id FROM cenit.accounts WHERE id=$1 AND role='administrativo' AND active", [accountId])).rows[0];
  if (!account) throw new Error('Se requiere una cuenta administrativa existente y activa.');
  const service = new PurchaseService(new PurchaseRepository(pool), undefined, { secondReviewEnabled: true, sheetsSyncEnabled: false });
  let created = 0;
  for (const { input, reviewed } of purchaseDemoExamples) {
    const result = await service.create(input, accountId);
    if (result.created) created++;
    // Repeating a local review preserves its first reviewer, timestamp and version.
    if (reviewed) await service.validate(result.record.id, result.record.version, accountId);
  }
  return { created, retained: purchaseDemoExamples.length - created };
}

async function main() {
  if (process.argv.length > 2 || process.env.APP_ENV !== 'demo') throw new Error('Usa purchases:prepare-demo con APP_ENV=demo.');
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
    const result = await seedPurchaseDemo(pool, credential.id);
    console.log(`Compras ficticias preparadas: ${result.created} nuevas y ${result.retained} conservadas. No se modificaron cuentas ni claves.`);
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.error('Preparación de compras fallida. Revisa migraciones, permisos y cuenta privada. Los registros existentes se conservan; repetir retoma la carga sin duplicarlos.'); process.exitCode = 1;
});
