import { formCells, formDateParts, styleCells, type FormEntry, type FormLayout } from '../common/forms.js';
import type { AssetKind } from './index.js';

// Formularios de Bienes: copias exactas de los documentos recibidos, sin los datos del ejemplo. Las tres plantillas
// son páginas carta (612 × 792 pt) y las casillas se midieron sobre las líneas de sus tablas. Las letras imitan lo
// que se escribió en cada original (Times o Arial), con las fuentes estándar del PDF.

export const assetKindLabels: Record<AssetKind, string> = {
  equipo_computacional: 'Equipo computacional', equipo: 'Equipo', mueble: 'Mueble', maquinaria: 'Maquinaria',
  construccion: 'Construcción', accesorio: 'Accesorio', otro: 'Otro',
};
/** Filas para bienes que trae el acta de entrega: más no caben en el formato. */
export const maxDeliveryItems = 8;

type DocPerson = { name: string; rut?: string | null; unit?: string | null; position?: string | null };
const value = (text: string | number | null | undefined) => text == null ? '' : String(text).trim();
const padded = (date: string) => formDateParts(date).map((part, index) => index < 2 && part ? part.padStart(2, '0') : part) as [string, string, string];
const dateText = (date: string) => { const parts = padded(date); return parts[0] ? parts.join('/') : ''; };
const lines = (...values: (string | null | undefined | false)[]) => values.filter(Boolean).join('\n');
const yesNo = (flag: boolean) => flag ? 'Sí' : 'No';

/** Datos de un bien para su ficha técnica: tipo, marca/modelo/serie o tipo/material/medidas, y lo que pide la Nota 1. */
type AssetFacts = {
  kind: AssetKind; brand?: string | null; model?: string | null; serialNumber?: string | null; furnitureType?: string | null;
  material?: string | null; dimensions?: string | null; area?: string | null; systemPart?: boolean; wallMounted?: boolean; assembled?: boolean;
};
function assetFacts(asset: AssetFacts) {
  const pairs: [string, string | null | undefined][] = asset.kind === 'mueble' ? [['Tipo', asset.furnitureType], ['Material', asset.material], ['Medidas', asset.dimensions]]
    : asset.kind === 'construccion' ? [['Medidas (m²)', asset.area], ['Materiales', asset.material]]
      : [['Marca', asset.brand], ['Modelo', asset.model], ['N° de serie', asset.serialNumber]];
  return pairs.filter(([, text]) => value(text)).map(([label, text]) => `${label}: ${value(text)}`).join(' · ');
}

// ── Alta de bienes inventariables (Sección Registro). ─────────────────────────────────────────────
const altaBoxes = {
  day: [459.4, 94.3, 28, 20.6], month: [487.9, 94.3, 28.1, 20.6], year: [516.5, 94.3, 27.8, 20.6],
  quantity: [227.7, 238.2, 317.1, 17.9], description: [227.7, 256.6, 317.1, 18], location: [227.7, 277.5, 317.1, 49.4],
  custodian: [227.7, 327.4, 317.1, 18.2],
  details: [110.5, 418.5, 434.6, 108], signName: [110.5, 529.6, 434.6, 12.6], signPosition: [110.5, 542.2, 434.6, 12.6], signUnit: [110.5, 554.8, 434.6, 12.6],
} as const;
export const assetAltaForm: FormLayout<keyof typeof altaBoxes> = {
  sheet: { width: 612, height: 792 }, placement: 'page',
  style: { align: 'left', valign: 'middle', font: 'sans', size: 11, upper: false },
  cells: formCells(altaBoxes, {
    ...styleCells(['day', 'month', 'year'], { align: 'center', size: 9 }),
    ...styleCells(['location', 'details'], { valign: 'top' }),
    ...styleCells(['signName', 'signPosition', 'signUnit'], { align: 'center', font: 'sans-bold' }),
  }),
};
export type AltaFormData = AssetFacts & {
  registeredOn: string; quantity: number | string; description: string; location: string; notes?: string | null;
  code?: string | null; inventoryNumber?: string | null; custodian: DocPerson | null;
};
/** Alta: cantidad, descripción, ubicación y responsable; en «Más datos», lo que piden las notas 1 y 2, el código Cenit y las observaciones. */
export function assetAltaEntries(a: AltaFormData): FormEntry<keyof typeof altaBoxes>[] {
  const [day, month, year] = padded(a.registeredOn);
  const note1 = a.kind === 'mueble' ? `Adosado al piso o a la pared: ${yesNo(!!a.wallMounted)}`
    : a.kind === 'equipo_computacional' ? `Equipo armado: ${yesNo(!!a.assembled)} · Parte de un sistema: ${yesNo(!!a.systemPart)}`
      : ['equipo', 'maquinaria'].includes(a.kind) ? `Parte de un sistema: ${yesNo(!!a.systemPart)}` : '';
  const codes = [value(a.code) && `Código Cenit: ${value(a.code)}`, value(a.inventoryNumber) && `N° de inventario: ${value(a.inventoryNumber)}`].filter(Boolean).join(' · ');
  return [
    ['day', 'Fecha de alta', day], ['month', 'Fecha de alta', month], ['year', 'Fecha de alta', year],
    ['quantity', 'Cantidad', value(a.quantity)], ['description', 'Descripción', value(a.description)], ['location', 'Ubicación', value(a.location)],
    ['custodian', 'Responsable', value(a.custodian?.name)],
    ['details', 'Más datos y observaciones', lines(value(a.description) && `${assetKindLabels[a.kind]}: ${value(a.description)}`, assetFacts(a), note1, codes, value(a.notes))],
    ['signName', 'Responsable', value(a.custodian?.name)], ['signPosition', 'Cargo del responsable', value(a.custodian?.position)], ['signUnit', 'Unidad del responsable', value(a.custodian?.unit)],
  ];
}

// ── Entrega de equipos e insumos (bienes inventariables y gastos controlados). ────────────────────
const rowTops = [289.2, 306.2, 323.3, 340.3, 357.1, 374.2, 391.2, 408.2] as const;
const rowCells = rowTops.flatMap((top, row) => [
  [`q${row}`, [85.2, top, 49.2, 16.6]], [`d${row}`, [134.9, top, 212.2, 16.6]], [`b${row}`, [347.5, top, 70.3, 16.6]], [`s${row}`, [418.3, top, 123.6, 16.6]],
] as const);
const deliveryBoxes = {
  day: [455, 31.2, 27.8, 20.9], month: [483.4, 31.2, 28.1, 20.9], year: [511.9, 31.2, 27.8, 20.9], number: [456.2, 98.1, 70, 19],
  name: [170.2, 162.5, 240.5, 18], rut: [170.2, 181, 371.8, 18], unit: [170.2, 199.4, 371.8, 17.5], position: [170.2, 217.4, 371.8, 17.8],
  ...Object.fromEntries(rowCells) as Record<`${'q' | 'd' | 'b' | 's'}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`, readonly [number, number, number, number]>,
  reason: [149, 453.1, 392.9, 19.9], deliveredOn: [205.7, 487.9, 107.8, 20.9],
  giverName: [85.2, 564.6, 453.1, 12.2], giverPosition: [85.2, 576.8, 453.1, 12.2], giverUnit: [85.2, 589, 453.1, 12.2],
  notes: [126, 604.4, 412, 76],
} as const;
type DeliveryCell = keyof typeof deliveryBoxes;
const itemCells = (prefix: 'q' | 'd' | 'b' | 's') => rowTops.map((_, row) => `${prefix}${row}` as DeliveryCell);
export const assetDeliveryForm: FormLayout<DeliveryCell> = {
  sheet: { width: 612, height: 792 }, placement: 'page',
  style: { align: 'left', valign: 'middle', font: 'sans', size: 12, upper: false },
  cells: formCells(deliveryBoxes, {
    ...styleCells(['day', 'month', 'year'], { align: 'center', font: 'serif', size: 10 }),
    number: { font: 'serif-bold', size: 16 },
    ...styleCells(['name', 'rut', 'unit', 'position'], { font: 'serif-bold', upper: true }),
    ...styleCells([...itemCells('q'), ...itemCells('b'), ...itemCells('s')], { align: 'center', size: 10, upper: true }),
    ...styleCells(itemCells('d'), { size: 10, upper: true }),
    deliveredOn: { align: 'center', font: 'sans-bold' },
    ...styleCells(['giverName', 'giverPosition', 'giverUnit'], { align: 'center', font: 'sans-bold', size: 10.5 }),
    giverName: { align: 'center', font: 'sans-bold', size: 10.5, upper: true },
    notes: { valign: 'top', font: 'sans-bold', size: 11, upper: true },
  }),
};
export type DeliveryFormData = {
  number: string | null; deliveredOn: string; receiver: DocPerson | null; reason: string;
  items: { quantity: number | string; description: string; brand: string | null; serialNumber: string | null }[];
  giverName: string; giverPosition: string | null; giverUnit: string | null; notes: string | null;
};
/** Entrega: quien recibe, hasta ocho bienes con cantidad/descripción/marca/serie, motivo, fecha, quien entrega y nota. */
export function assetDeliveryEntries(d: DeliveryFormData): FormEntry<DeliveryCell>[] {
  const [day, month, year] = padded(d.deliveredOn);
  return [
    ['day', 'Fecha de entrega', day], ['month', 'Fecha de entrega', month], ['year', 'Fecha de entrega', year],
    ['number', 'Número', value(d.number?.split('/')[0])],
    ['name', 'Nombre de quien recibe', value(d.receiver?.name)], ['rut', 'RUT de quien recibe', value(d.receiver?.rut)],
    ['unit', 'Unidad de quien recibe', value(d.receiver?.unit)], ['position', 'Cargo de quien recibe', value(d.receiver?.position)],
    ...d.items.slice(0, maxDeliveryItems).flatMap((item, row): FormEntry<DeliveryCell>[] => [
      [`q${row}` as DeliveryCell, `Cantidad del bien ${row + 1}`, value(item.quantity)], [`d${row}` as DeliveryCell, `Descripción del bien ${row + 1}`, value(item.description)],
      [`b${row}` as DeliveryCell, `Marca del bien ${row + 1}`, value(item.brand)], [`s${row}` as DeliveryCell, `Serie del bien ${row + 1}`, value(item.serialNumber)],
    ]),
    ['reason', 'Motivo', value(d.reason)], ['deliveredOn', 'Fecha de entrega', dateText(d.deliveredOn)],
    ['giverName', 'Nombre de quien entrega', value(d.giverName)], ['giverPosition', 'Cargo de quien entrega', value(d.giverPosition)],
    ['giverUnit', 'Unidad de quien entrega', value(d.giverUnit)], ['notes', 'Observaciones', value(d.notes)],
  ];
}

// ── Préstamo transitorio de bienes (información requerida N° folio/año). ──────────────────────────
const loanBoxes = {
  day: [460.3, 71.3, 27.8, 20.6], month: [488.6, 71.3, 27.8, 20.6], year: [517, 71.3, 27.8, 20.6], number: [406.1, 170.6, 100, 19],
  quantity: [216.5, 247, 329.3, 18], description: [216.5, 265.4, 329.3, 18], location: [216.5, 283.9, 329.3, 18],
  name: [216.5, 302.4, 329.3, 18], rut: [216.5, 320.9, 329.3, 18],
  details: [113.8, 505.2, 434.2, 39.4], authorizer: [216.5, 625.4, 329.3, 18], authorizerUnit: [216.5, 643.9, 329.3, 18],
} as const;
export const assetLoanForm: FormLayout<keyof typeof loanBoxes> = {
  sheet: { width: 612, height: 792 }, placement: 'page',
  style: { align: 'left', valign: 'middle', font: 'sans', size: 12, upper: false },
  cells: formCells(loanBoxes, {
    ...styleCells(['day', 'month', 'year'], { align: 'center', size: 10 }),
    number: { size: 16 },
    details: { valign: 'top', size: 9 },
  }),
};
export type LoanFormData = {
  number: string | null; loanedOn: string; dueOn: string | null; borrower: DocPerson | null; location: string | null;
  items: (Omit<AssetFacts, 'furnitureType' | 'area'> & { code?: string; quantity: number | string; description: string })[];
  authorizerName: string; authorizerUnit: string | null; notes: string | null;
};
/** Préstamo de un bien: cantidad, descripción con su serie, ubicación, quien lo recibe, más datos y quien autoriza. */
export function assetLoanEntries(l: LoanFormData): FormEntry<keyof typeof loanBoxes>[] {
  const [day, month, year] = formDateParts(l.loanedOn, true);
  const quantity = l.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return [
    ['day', 'Fecha del préstamo', day], ['month', 'Fecha del préstamo', month], ['year', 'Fecha del préstamo', year],
    ['number', 'Número', value(l.number)],
    ['quantity', 'Cantidad', quantity ? String(quantity) : ''],
    ['description', 'Descripción', l.items.map(item => [value(item.description), value(item.serialNumber) && `SN: ${value(item.serialNumber)}`].filter(Boolean).join(' ')).join('; ')],
    ['location', 'Ubicación', value(l.location)], ['name', 'Nombre de quien recibe', value(l.borrower?.name)], ['rut', 'RUT de quien recibe', value(l.borrower?.rut)],
    ['details', 'Más datos y observaciones', lines(
      ...l.items.map(item => [`${assetKindLabels[item.kind]}: ${value(item.description)}`, assetFacts(item), value(item.code) && `Código Cenit: ${value(item.code)}`].filter(Boolean).join(' · ')),
      l.dueOn && `Devolución esperada: ${dateText(l.dueOn)}`, value(l.notes),
    )],
    ['authorizer', 'Quien autoriza', value(l.authorizerName)], ['authorizerUnit', 'Unidad de quien autoriza', value(l.authorizerUnit)],
  ];
}
