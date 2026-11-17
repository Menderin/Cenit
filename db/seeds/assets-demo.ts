import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { AssetKind, CreateAsset } from '@cenit/contracts/assets';
import { createPool, databaseUrl } from '../../apps/api/src/infrastructure/database/connection.js';
import { AssetRepository } from '../../apps/api/src/modules/assets/repositories/assets.js';
import { privateDemoCredentials } from './auth-demo.js';

// Bienes ficticios para la demo local. Personas, series, números de inventario y ubicaciones son inventados;
// no se copian datos de los formularios recibidos. Las fechas se calculan desde hoy para que siempre haya
// préstamos activos, vencidos y devueltos.
const op = (group: number, index: number) => `55555555-5555-4555-8555-${String(group).padStart(4, '0')}${String(index).padStart(8, '0')}`;
const day = (offset: number) => { const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

const people = [
  { name: 'Camila Soto Araya', rut: '15.482.903-2', position: 'Secretaria administrativa', unit: 'Facultad de Medicina' },
  { name: 'Tomás Vera Rojas', rut: '16.903.214-9', position: 'Profesor asistente', unit: 'Departamento de Ciencias Biomédicas' },
  { name: 'Emilia Fuentes Lagos', rut: '17.225.640-6', position: 'Profesional de apoyo docente', unit: 'Escuela de Medicina' },
  { name: 'Joaquín Andrés Saavedra Pizarro', rut: '18.340.127-0', position: 'Técnico de laboratorio', unit: 'Departamento de Ciencias Biomédicas' },
  { name: 'Francisca Olivares Muñoz', rut: '16.051.938-K', position: 'Coordinadora de campos clínicos', unit: 'Unidad de Campos Clínicos' },
  { name: 'Benjamín Cortés Alfaro', rut: '19.112.406-5', position: 'Instructor', unit: 'Escuela de Nutrición y Dietética' },
  { name: 'Antonia Reyes Bustamante', rut: '12.667.385-K', position: 'Profesora titular', unit: 'Departamento de Clínicas' },
  { name: 'Diego Alejandro Henríquez Lagos', rut: '17.790.253-5', position: 'Auxiliar de servicios', unit: 'Facultad de Medicina' },
  { name: 'Valentina Paz Castillo Riquelme', rut: '18.456.721-0', position: 'Docente clínica', unit: 'Escuela de Enfermería' },
  { name: 'Ignacio Muñoz Barraza', rut: '15.903.118-4', position: 'Médico residente', unit: 'CESFAM docente asistencial' },
  { name: 'Rodrigo Pérez Iturra', rut: '11.204.587-3', position: 'Profesor asociado', unit: 'Departamento de Clínicas' },
  { name: 'Marcela Contreras Vidal', rut: '14.337.902-1', position: 'Enfermera coordinadora', unit: 'CESFAM docente asistencial' },
] as const;
type P = typeof people[number]['name'];

type Seed = Partial<CreateAsset> & { kind: AssetKind; description: string; location: string; on: number };
const assets: Seed[] = [
  { kind: 'equipo_computacional', description: 'Computador todo en uno ThinkCentre', brand: 'Lenovo', model: 'Neo 50a', serialNumber: 'PF4XK21M', inventoryNumber: 'INV-FM-0318', location: 'Bodega, Pabellón E', on: -240 },
  { kind: 'equipo_computacional', description: 'Notebook ThinkBook 14', brand: 'Lenovo', model: 'G4 IAP', serialNumber: 'MP7QW0RT', location: 'Bodega, Pabellón E', notes: 'Intel i7, 16 GB RAM, 512 GB SSD, Windows 11 Pro.', on: -230 },
  { kind: 'equipo', description: 'Proyector láser', brand: 'ViewSonic', model: 'LS610', serialNumber: 'VS2290XA', inventoryNumber: 'INV-FM-0311', location: 'Bodega, Pabellón E', notes: 'Incluye control remoto, cable HDMI de 3 m y bolso de transporte.', on: -220 },
  { kind: 'equipo', description: 'Tallímetro de pared', brand: 'Seca', model: '216', location: 'Bodega, Pabellón E', on: -210 },
  { kind: 'mueble', description: 'Escritorio en L', furnitureType: 'Escritorio', material: 'Melamina y acero', dimensions: '160 × 120 × 75 cm', inventoryNumber: 'INV-FM-0300', location: 'Oficina 112, Pabellón A', on: -208 },
  { kind: 'maquinaria', description: 'Centrífuga de mesa', brand: 'Hettich', model: 'EBA 200', serialNumber: '0004721-02', location: 'Bodega, Pabellón E', systemPart: false, on: -200 },
  { kind: 'equipo_computacional', description: 'Monitor 24 pulgadas', brand: 'Dell', model: 'P2422H', serialNumber: 'CN0F2X9K', inventoryNumber: 'INV-FM-0297', location: 'Bodega, Pabellón E', on: -195 },
  { kind: 'equipo', description: 'Fonendoscopio adulto', brand: 'Littmann', model: 'Classic III', serialNumber: 'LC3-88412', location: 'Sala de procedimientos, Pabellón E', on: -190 },
  { kind: 'equipo', description: 'Cámara documental', brand: 'IPEVO', model: 'V4K', serialNumber: 'IPV4K-55120', location: 'Sala 204, Pabellón E', on: -180 },
  { kind: 'mueble', description: 'Silla ergonómica', furnitureType: 'Silla de oficina', material: 'Malla y aluminio', dimensions: '65 × 65 × 115 cm', location: 'Bodega, Pabellón E', on: -175 },
  { kind: 'equipo', description: 'Esfigmomanómetro digital', brand: 'Omron', model: 'HEM-7156', serialNumber: 'OM7156-30981', location: 'Box 2, CESFAM docente', on: -175 },
  { kind: 'equipo', description: 'Balanza digital de piso', brand: 'Seca', model: '803', serialNumber: 'SC803-11290', location: 'Box 1, CESFAM docente', on: -165 },
  { kind: 'equipo_computacional', description: 'Impresora láser multifuncional', brand: 'HP', model: 'LaserJet MFP M236', serialNumber: 'VNB3K18220', location: 'Secretaría, Pabellón A', on: -160 },
  { kind: 'mueble', description: 'Estante metálico de 5 repisas', furnitureType: 'Estante', material: 'Acero', dimensions: '90 × 40 × 200 cm', wallMounted: true, location: 'Bodega, Pabellón E', on: -150 },
  { kind: 'equipo', description: 'Microscopio óptico binocular', brand: 'Olympus', model: 'CX23', serialNumber: '3K45091', inventoryNumber: 'INV-FM-0254', location: 'Laboratorio 3, Pabellón E', systemPart: true, on: -140 },
  { kind: 'equipo', description: 'Microscopio óptico binocular', brand: 'Olympus', model: 'CX23', serialNumber: '3K45092', inventoryNumber: 'INV-FM-0255', location: 'Laboratorio 3, Pabellón E', systemPart: true, on: -140 },
  { kind: 'equipo_computacional', description: 'Notebook Latitude 3440', brand: 'Dell', model: 'Latitude 3440', serialNumber: '7HQ2LZ3', location: 'Bodega, Pabellón E', on: -120 },
  { kind: 'accesorio', description: 'Candado de seguridad para notebook', brand: 'Kensington', quantity: 4, location: 'Bodega, Pabellón E', on: -118 },
  { kind: 'equipo', description: 'Electrocardiógrafo de 12 canales', brand: 'Contec', model: 'ECG1200G', serialNumber: 'CT12-009871', location: 'Sala de procedimientos, Pabellón E', on: -110 },
  { kind: 'mueble', description: 'Mesa de reuniones', furnitureType: 'Mesa', material: 'Madera enchapada', dimensions: '240 × 110 × 75 cm', location: 'Sala de reuniones, Pabellón A', on: -100 },
  { kind: 'equipo_computacional', description: 'Tablet para registro clínico', brand: 'Samsung', model: 'Galaxy Tab A9+', serialNumber: 'R9WT40XKQ', location: 'Bodega, Pabellón E', on: -90 },
  { kind: 'construccion', description: 'Habilitación de box de atención', area: '12 m²', material: 'Tabiquería volcanita, piso vinílico', location: 'Box 4, CESFAM docente', on: -88 },
  { kind: 'equipo', description: 'Oxímetro de pulso', brand: 'Nonin', model: 'Onyx Vantage 9590', serialNumber: '501230982', location: 'Bodega, Pabellón E', on: -60 },
  { kind: 'equipo', description: 'Parlante portátil para aula', brand: 'JBL', model: 'Charge 5', serialNumber: 'JBLC5-AX0912', location: 'Bodega, Pabellón E', on: -45 },
  { kind: 'equipo_computacional', description: 'Computador de escritorio armado', brand: 'Genérico', serialNumber: 'Sin serie de fábrica', assembled: true, location: 'Bodega, Pabellón E', notes: 'Ryzen 5, 16 GB RAM, 1 TB SSD.', on: -30 },
  { kind: 'equipo', description: 'Simulador de reanimación adulto', brand: 'Laerdal', model: 'Little Anne QCPR', serialNumber: 'LA-QC-77012', location: 'Bodega, Pabellón E', on: -12 },
];
// Entregas: [días desde hoy, receptor, índices de bienes, motivo, destino]
const deliveries: [number, P, number[], string, string | null][] = [
  [-235, 'Camila Soto Araya', [0], 'Para uso administrativo de la secretaría de la Facultad.', 'Secretaría, Pabellón A'],
  [-218, 'Emilia Fuentes Lagos', [2], 'Para uso docente en salas de Pabellón E.', 'Sala 204, Pabellón E'],
  [-206, 'Francisca Olivares Muñoz', [4], 'Mobiliario para la coordinación de campos clínicos.', null],
  [-192, 'Joaquín Andrés Saavedra Pizarro', [6, 5], 'Equipamiento del laboratorio de ciencias biomédicas.', 'Laboratorio 3, Pabellón E'],
  [-185, 'Rodrigo Pérez Iturra', [3, 7], 'Para uso asistencial docente en CESFAM.', 'Box 1, CESFAM docente'],
  [-172, 'Ignacio Muñoz Barraza', [10], 'Control de signos vitales en box de atención.', null],
  [-138, 'Joaquín Andrés Saavedra Pizarro', [14, 15], 'Docencia práctica de histología.', null],
  [-115, 'Tomás Vera Rojas', [1, 17], 'Equipo de trabajo para docencia y proyectos.', 'Oficina 208, Pabellón E'],
  [-98, 'Antonia Reyes Bustamante', [18, 19], 'Equipamiento para docencia clínica.', null],
  [-85, 'Marcela Contreras Vidal', [20, 21], 'Registro clínico y habilitación de box.', 'Box 4, CESFAM docente'],
  [-40, 'Rodrigo Pérez Iturra', [16, 9], 'Puesto de trabajo docente.', 'Oficina 214, Pabellón E'],
  [-178, 'Emilia Fuentes Lagos', [8], 'Apoyo a clases expositivas.', null],
  [-158, 'Camila Soto Araya', [12], 'Impresión de documentos de la secretaría.', null],
  [-160, 'Rodrigo Pérez Iturra', [11], 'Control antropométrico en CESFAM.', null],
];
// Préstamos: [días desde hoy, devolución esperada (días desde hoy), persona, bienes, ubicación, devuelto (días desde hoy)]
const loans: [number, number | null, P, number[], string, number | null][] = [
  [-26, -17, 'Valentina Paz Castillo Riquelme', [2], 'Escuela de Enfermería', null],
  [-14, -2, 'Benjamín Cortés Alfaro', [1], 'Docencia, Escuela de Nutrición', null],
  [-6, 24, 'Antonia Reyes Bustamante', [7], 'Campo clínico, Hospital docente', null],
  [-2, null, 'Diego Alejandro Henríquez Lagos', [8], 'Auditorio, Pabellón A', null],
  [-11, 50, 'Camila Soto Araya', [9], 'Secretaría, Pabellón A', null],
  [-70, -55, 'Emilia Fuentes Lagos', [20], 'Actividad de extensión', -56],
  [-50, -40, 'Benjamín Cortés Alfaro', [22], 'Taller práctico', -41],
];

export async function seedAssetDemo(pool: Pool, accountId: string) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Preparación exclusiva de demo/pruebas.');
  if ((await pool.query('SELECT 1 FROM cenit.assets WHERE created_by = $1 AND operation_id = $2', [accountId, op(1, 0)])).rowCount) return { created: false };
  const repository = new AssetRepository(pool);
  const personIds = new Map<string, string>();
  for (const person of people) personIds.set(person.name, (await repository.createPerson(person, accountId)).id);
  const purchases = (await pool.query("SELECT id FROM cenit.purchase_requests ORDER BY sent_date DESC LIMIT 3")).rows.map(row => row.id as string);
  const assetIds: string[] = [];
  for (const [index, { on, ...seed }] of assets.entries()) {
    const record = await repository.create({
      operationId: op(1, index), quantity: 1, inventoryNumber: null, brand: null, model: null, serialNumber: null, furnitureType: null, material: null, dimensions: null, area: null,
      systemPart: false, wallMounted: false, assembled: false, notes: null, custodianId: null, registeredOn: day(on),
      purchaseId: [0, 2, 16].includes(index) ? purchases[[0, 2, 16].indexOf(index)] ?? null : null, ...seed,
    }, accountId);
    assetIds.push(record.record.id);
  }
  for (const [index, [on, receiver, items, reason, destination]] of [...deliveries].sort((a, b) => a[0] - b[0]).entries()) {
    await repository.createDelivery({ operationId: op(2, index), receiverId: personIds.get(receiver)!, deliveredOn: day(on), reason, destination,
      giverName: 'Coordinación de Gestión y Proyectos', giverPosition: 'Coordinación', giverUnit: 'Facultad de Medicina', notes: null,
      items: items.map(item => ({ assetId: assetIds[item]! })) }, accountId);
  }
  const [projector] = await Promise.all([repository.get(assetIds[2]!)]);
  if (projector) await repository.relocate(projector.id, { expectedVersion: projector.version, location: 'Sala 201, Pabellón E', occurredOn: day(-160), note: 'Traslado por remodelación de la sala 204.' }, accountId);
  for (const [index, [on, due, borrower, items, location, returned]] of [...loans].sort((a, b) => a[0] - b[0]).entries()) {
    const loan = await repository.createLoan({ operationId: op(3, index), borrowerId: personIds.get(borrower)!, loanedOn: day(on), dueOn: due === null ? null : day(due), location,
      authorizerName: 'Coordinación de Gestión y Proyectos', authorizerUnit: 'Facultad de Medicina', notes: null, assetIds: items.map(item => assetIds[item]!) }, accountId);
    if (returned !== null) await repository.returnLoan(loan.record.id, { returnedOn: day(returned), note: 'Devuelto en buen estado.' }, accountId);
  }
  await pool.query(`UPDATE cenit.asset_people SET active = false, inactive_since = $2 WHERE id = $1`, [personIds.get('Rodrigo Pérez Iturra'), day(-20)]);
  return { created: true, assets: assets.length, deliveries: deliveries.length, loans: loans.length, people: people.length };
}

async function main() {
  if (process.env.APP_ENV !== 'demo') throw new Error('Usa assets:prepare-demo con APP_ENV=demo.');
  const url = new URL(databaseUrl());
  if (url.hostname !== '127.0.0.1' || url.username !== 'cenit_migrator' || url.pathname !== '/cenit_demo') throw new Error('Preparación limitada a cenit_migrator sobre cenit_demo local.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (!existsSync(resolve(root, '.local/secrets/auth-demo.json'))) throw new Error('Prepara primero las cuentas originales.');
  const credential = privateDemoCredentials(root).find(account => account.role === 'administrativo')!;
  const pool = createPool();
  try {
    const account = (await pool.query("SELECT id FROM cenit.accounts WHERE id=$1 AND email=$2 AND role='administrativo' AND active", [credential.id, credential.email])).rows[0];
    if (!account) throw new Error('Cuenta privada incompatible; no se modificó.');
    const result = await seedAssetDemo(pool, credential.id);
    console.log(result.created ? `Bienes ficticios preparados: ${result.assets} bienes, ${result.deliveries} entregas, ${result.loans} préstamos y ${result.people} personas.` : 'Los bienes ficticios ya estaban preparados; no se modificó nada.');
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Preparación de bienes fallida.'); process.exitCode = 1;
});
