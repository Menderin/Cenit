import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { CreatePurchase } from '@cenit/contracts/purchases';
import { itemFromAccount, rutCheckDigit } from '../../packages/contracts/src/purchases/suggestions.js';
import { createPool, databaseUrl } from '../../apps/api/src/infrastructure/database/connection.js';
import { PurchaseService } from '../../apps/api/src/modules/purchases/services/purchases.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { ApiError } from '../../apps/api/src/infrastructure/errors.js';
import { privateDemoCredentials } from './auth-demo.js';

// Compras ficticias con la forma del «Registro de gastos» del cliente. Los códigos de unidad, proyecto y cuenta son los
// del catálogo oficial (autorizado); proveedores, RUT, nombres, montos y números de solicitud son inventados.
const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
let state = 20261122;
const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const rut = (body: number) => `${body}-${rutCheckDigit(String(body))}`;
const person = (name: string, short: string, body: number) => ({ name, short, rut: rut(body) });
const company = (name: string, short: string, body: number) => ({ name, short, rut: rut(body) });

const people = [
  person('CAMILA ANDREA ROJAS VERA', 'CAMILA ROJAS', 16482379), person('MARÍA JOSÉ TAPIA LEIVA', 'MARÍA TAPIA', 17204836),
  person('FELIPE ANDRÉS MORALES CID', 'FELIPE MORALES', 18820461), person('JORGE IGNACIO SALAS PIZARRO', 'JORGE SALAS', 13579264),
  person('RODRIGO ESTEBAN CORTÉS AVILÉS', 'RODRIGO CORTÉS', 15938207), person('VALENTINA PAZ SOTO REYES', 'VALENTINA SOTO', 19317542),
  person('CRISTÓBAL IGNACIO VEGA MUÑOZ', 'CRISTÓBAL VEGA', 14826903), person('JAVIERA ANTONIA FUENTES LARA', 'JAVIERA FUENTES', 18045172),
  person('MATÍAS ALEJANDRO NÚÑEZ ROJAS', 'MATÍAS NÚÑEZ', 16730458), person('DANIELA FERNANDA CASTRO OLIVARES', 'DANIELA CASTRO', 17592864),
  person('SEBASTIÁN ANDRÉS PEÑA TORO', 'SEBASTIÁN PEÑA', 15204971), person('CONSTANZA BELÉN RIVAS ARAYA', 'CONSTANZA RIVAS', 19650283),
  person('PATRICIO HERNÁN ÁLVAREZ GODOY', 'PATRICIO ÁLVAREZ', 10473862), person('LORENA ISABEL MIRANDA CÁCERES', 'LORENA MIRANDA', 12938476),
];
const caterers = [company('BANQUETERÍA LOS AROMOS SPA', 'BANQUETERÍA LOS AROMOS', 76918240), company('SABORES DEL LIMARÍ LTDA', 'SABORES DEL LIMARÍ', 77104536),
  company('CAFETERÍA PUERTA DEL MAR SPA', 'PUERTA DEL MAR', 76583921)];
const agencies = [company('TURISMO ALTIPLANO LTDA', 'TURISMO ALTIPLANO', 77302815), company('VIAJES COSTA NORTE SPA', 'COSTA NORTE', 76247019)];
const suppliers = [company('INSUMOS CLÍNICOS DEL NORTE SPA', 'INSUMOS CLÍNICOS DEL NORTE', 76455102), company('LABORATORIO ANDINO SPA', 'LABORATORIO ANDINO', 76330971),
  company('REACTIVOS DEL PACÍFICO LTDA', 'REACTIVOS DEL PACÍFICO', 77418265)];
const printers = [company('IMPRENTA PUERTO ESCRITO LTDA', 'IMPRENTA PUERTO ESCRITO', 77801533), company('GRÁFICA EL QUISCO SPA', 'GRÁFICA EL QUISCO', 76902148)];
const hostels = [company('HOSTAL VALLE DEL ELQUI SPA', 'HOSTAL VALLE DEL ELQUI', 76692418), company('HOTEL BAHÍA SERENA LTDA', 'HOTEL BAHÍA SERENA', 77056391)];
const technicians = [company('SERVICIOS TÉCNICOS BIOEQUIPOS SPA', 'BIOEQUIPOS', 76771304)];

type Template = { weight: number; build: (month: string, year: number) => { provider: { name: string; short: string; rut: string }; description: string; amount: number;
  unitCode: string; projectCode: string; accountingCode: string; honorarios?: number; area: string } };
const templates: Template[] = [
  { weight: 5, build: (month, year) => { const p = pick(people), bi = between(10, 180), clinics = random() < .45;
    return { provider: p, honorarios: bi, area: clinics ? 'CLINICA' : 'FAMED', unitCode: clinics && random() < .4 ? '270203' : '270101', projectCode: clinics && random() < .4 ? '40101001' : '00000000',
      accountingCode: '410103', amount: between(8, 60) * 11000,
      description: `SERVICIOS PROFESIONALES BOL/${bi}, ${between(8, 44)} HRS. ${pick(['DOCENCIA INTERNADO APS MEDICINA', 'TUTORÍAS PREGRADO', 'HORA CÁTEDRA PEDIATRÍA', 'COORDINACIÓN INTERNADO'])}${clinics ? ', DEPTO CLINICAS' : ''}, ${month} ${year}, ${p.short}_${p.rut.replace('-', '')}` }; } },
  { weight: 3, build: (month, year) => { const p = pick(people.slice(3, 9));
    return { provider: p, area: 'FAMED', unitCode: '270101', projectCode: '00000000', accountingCode: '420632', amount: between(35, 70) * 10000,
      description: `ARRIENDO CASA HABITACIÓN, INTERNADO MÉDICO RURAL, ${pick(['COMBARBALÁ', 'ILLAPEL', 'VICUÑA', 'OVALLE', 'SALAMANCA'])}, ${p.short}, ${month} ${year}_${p.rut.replace('-', '')}` }; } },
  { weight: 2, build: (month, year) => { const p = pick(caterers), event = pick(['CEREMONIA DE INVESTIDURA', 'SEMANA DEL POSTULANTE', 'JORNADA DE SALUD PÚBLICA', 'CONSEJO DE FACULTAD']);
    const publicHealth = event.includes('SALUD PÚBLICA');
    return { provider: p, area: publicHealth ? 'SALUD PUBLICA' : 'FAMED', unitCode: publicHealth ? '270202' : '270101', projectCode: publicHealth ? '40101001' : '00000000',
      accountingCode: '420405', amount: between(40, 260) * 1000, description: `${p.short}, COFFEE ${event} ${year}, COT. ${String(between(1, 28)).padStart(2, '0')}${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}${year}` }; } },
  { weight: 2, build: (_month, year) => { const p = pick(agencies);
    return { provider: p, area: 'FAMED', unitCode: '270101', projectCode: '00000000', accountingCode: '420401', amount: between(180, 520) * 1000,
      description: `PASAJES AÉREOS LA SERENA – SANTIAGO, ${pick(['CONGRESO DE NUTRICIÓN', 'REUNIÓN ASOFAMECH', 'JORNADA DE KINESIOLOGÍA'])} ${year}, COT. S/N` }; } },
  { weight: 2, build: () => { const p = pick(suppliers), project = pick(['31101912', '40101001', '31101918', '10201251']);
    return { provider: p, area: 'CIENCIAS BIOMEDICAS', unitCode: '270201', projectCode: project, accountingCode: '420106', amount: between(120, 1400) * 1000,
      description: `${p.short}, INSUMOS DE LABORATORIO, PRÁCTICOS DE ${pick(['BIOQUÍMICA', 'MICROBIOLOGÍA', 'FISIOLOGÍA'])}, DEPTO CIENCIAS BIOMÉDICAS, COT. ${between(100, 9999)}` }; } },
  { weight: 1, build: () => { const p = pick(printers);
    return { provider: p, area: 'FAMED', unitCode: '270101', projectCode: '00000000', accountingCode: '420105', amount: between(60, 320) * 1000,
      description: `IMPRESIÓN DE GUÍAS CLÍNICAS, CARRERA DE ${pick(['ENFERMERÍA', 'NUTRICIÓN Y DIETÉTICA', 'KINESIOLOGÍA', 'MEDICINA'])}, COT. ${between(100, 9999)}` }; } },
  { weight: 1, build: () => { const p = pick(hostels), project = pick(['20702034', '20702036', '20702031']);
    return { provider: p, area: 'FAMED', unitCode: '270101', projectCode: project, accountingCode: '420406', amount: between(180, 700) * 1000,
      description: `ALOJAMIENTO DOCENTES INVITADOS, POSTÍTULO DE ESPECIALISTA, COT. S/N` }; } },
  { weight: 1, build: (_month, year) => { const p = pick(people.slice(9));
    return { provider: p, area: 'FAMED', unitCode: '270101', projectCode: '00000000', accountingCode: '420401', amount: between(10, 40) * 10000,
      description: `SUMA A RENDIR N°${String(between(1, 90)).padStart(3, '0')}-${year}, CEREMONIA DE TITULACIÓN, CARRERA DE ${pick(['KINESIOLOGÍA', 'ENFERMERÍA', 'NUTRICIÓN Y DIETÉTICA'])}, ${p.short}_${p.rut.replace('-', '')}` }; } },
  { weight: 1, build: () => { const p = pick(technicians);
    return { provider: p, area: 'CIENCIAS BIOMEDICAS', unitCode: '270201', projectCode: '31101751', accountingCode: '420354', amount: between(250, 900) * 1000,
      description: `${p.short}, MANTENCIÓN PREVENTIVA DIGITALIZADOR DE IMÁGENES, DEPTO CIENCIAS BIOMÉDICAS, COT. ${between(100, 999)}` }; } },
];
const weighted = templates.flatMap(template => Array.from({ length: template.weight }, () => template));

const firstMonth = { year: 2024, month: 1 }, lastMonth = { year: 2026, month: 11 };
const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
function buildExamples() {
  const examples: CreatePurchase[] = [];
  let requestNumber = 96000, oracleId = 2550000;
  for (let year = firstMonth.year, month = firstMonth.month; year < lastMonth.year || (year === lastMonth.year && month <= lastMonth.month); month === 12 ? (year++, month = 1) : month++) {
    const days = Array.from({ length: between(3, 6) }, () => between(2, 27)).sort((a, b) => a - b);
    for (const day of days) {
      const built = pick(weighted).build(MONTHS[month - 1]!, year);
      requestNumber += between(150, 320); oracleId += between(900, 1700);
      const sent = iso(year, month, Math.max(1, day - between(0, 2)));
      const type = built.honorarios ? 'HONORARIOS' : 'COTIZACIÓN';
      const account = `01.02.${built.unitCode}.${built.projectCode}.${built.accountingCode}`;
      examples.push({
        operationId: '', origin: { type: 'manual' },
        record: { recordDate: iso(year, month, day), document: 'SISTEMA DE COMPRAS', requestNumber: String(requestNumber), provider: built.provider.name,
          description: built.description, totalAmount: String(built.amount), documentType: type, bi: built.honorarios ? String(built.honorarios) : 'S/N',
          unitCode: built.unitCode, projectCode: built.projectCode, accountingCode: built.accountingCode, rut: built.provider.rut, area: built.area,
          item: itemFromAccount(built.accountingCode), paymentSituation: 'PAGADO' },
        oracle: { sentDate: sent, sentTime: `${String(between(9, 18)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}`,
          oracleId: String(oracleId), sender: 'PÉREZ SOTO, ANA', recipient: 'ROJAS DÍAZ, PEDRO', taxAmount: '0',
          attachmentReference: `${sent.slice(8, 10)}${sent.slice(5, 7)}${sent.slice(0, 4)} SI${requestNumber}_COQ ${built.honorarios ? `HEE BH${built.honorarios}` : 'COT'} ${built.provider.short}`.slice(0, 255) },
        lines: [{ description: built.description, provider: built.provider.name, costCenter: null, lineUnit: '1', quantity: '1', price: String(built.amount),
          amount: String(built.amount), chargeAccount: account, universityCode: '01', campusCode: '02', unitCode: built.unitCode, projectCode: built.projectCode, accountingCode: built.accountingCode }],
      });
    }
  }
  // Las más recientes siguen pendientes de pago; algunas compras de personas antiguas se registraron sin RUT.
  examples.slice(-6).forEach(example => { example.record.paymentSituation = 'PENDIENTE'; });
  examples.filter((_, index) => index % 37 === 5).forEach(example => { example.record.rut = null; });
  return examples;
}

function operationId(index: number) {
  return `44444444-4444-4444-8444-000000000${String(index + 1).padStart(3, '0')}`;
}
export const purchaseDemoExamples = buildExamples().map((input, index) => ({ input: { ...input, operationId: operationId(index) } }));

function registrationDayOffset(index: number) {
  // Reparte las incorporaciones en los 30 días del gráfico de actividad con un patrón repetible.
  return (index * 7 + Math.floor(index / 4) * 5) % 30;
}

type SeedRecord = { id: string; operationId: string; requestNumber: string; source: string; exampleId: string | null };

// Sólo se reemplazan registros de esta semilla: los ejemplos antiguos de contrato, la versión anterior de la demo
// («CENIT-AAAA-NNN») o la compra que esta semilla pone en esa misma operación.
function assertSeedRecord(record: SeedRecord, index: number) {
  if (record.source === 'contract_example') {
    const expectedRequestNumber = `DEMO-COMPRA-${String(index + 1).padStart(3, '0')}`;
    if (record.exampleId === 'recovered' && record.requestNumber === expectedRequestNumber) return;
  } else if (record.source === 'manual' && (/^CENIT-\d{4}-\d{3}$/.test(record.requestNumber) || record.requestNumber === purchaseDemoExamples[index]?.input.record.requestNumber)) return;
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

export async function seedPurchaseDemo(pool: Pool, accountId: string) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Preparación exclusiva de demo/pruebas.');
  const account = (await pool.query("SELECT id FROM cenit.accounts WHERE id=$1 AND role='administrativo' AND active", [accountId])).rows[0];
  if (!account) throw new Error('Se requiere una cuenta administrativa existente y activa.');
  const service = new PurchaseService(new PurchaseRepository(pool));
  // Reemplaza sólo lo que esta semilla dejó antes; cualquier otro uso de estas operaciones detiene la carga.
  const operationIds = purchaseDemoExamples.map((_, index) => operationId(index));
  const existing = await pool.query<SeedRecord & { version: number }>(
    `SELECT id,version,operation_id AS "operationId",request_number AS "requestNumber",source,example_id AS "exampleId"
     FROM cenit.purchase_requests WHERE created_by=$1 AND operation_id=ANY($2::uuid[]) ORDER BY operation_id`,
    [accountId, operationIds]);
  let replaced = 0;
  for (const record of existing.rows) {
    const index = operationIds.indexOf(record.operationId);
    assertSeedRecord(record, index);
    if (record.requestNumber !== purchaseDemoExamples[index]!.input.record.requestNumber || record.source !== 'manual') {
      await service.delete(record.id, record.version);
      replaced++;
    }
  }

  let created = 0;
  const seededRecords: Array<SeedRecord & { index: number }> = [];
  for (const [index, { input }] of purchaseDemoExamples.entries()) {
    let result;
    try { result = await service.create(input, accountId); }
    catch (error) {
      // Una versión anterior de esta misma compra ficticia: se reemplaza por la vigente.
      if (!(error instanceof ApiError) || error.code !== 'OPERATION_CONFLICT') throw error;
      const previous = (await pool.query('SELECT id,version FROM cenit.purchase_requests WHERE created_by=$1 AND operation_id=$2', [accountId, input.operationId])).rows[0];
      await service.delete(previous.id, previous.version); replaced++;
      result = await service.create(input, accountId);
    }
    if (result.created) {
      created++;
      seededRecords.push({ id: result.record.id, index, operationId: input.operationId, requestNumber: input.record.requestNumber, source: 'manual', exampleId: null });
    }
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
      console.log(`Compras ficticias preparadas: ${result.created} nuevas, ${result.retained} conservadas y ${result.replaced} versiones anteriores reemplazadas. No se modificaron cuentas ni claves.`);
    }
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.error('Preparación de compras fallida. Revisa migraciones, permisos y cuenta privada. Los registros existentes se conservan; repetir retoma la carga sin duplicarlos.'); process.exitCode = 1;
});
