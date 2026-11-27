import ExcelJS from 'exceljs';
import type { Writable } from 'node:stream';
import { lineFieldLabels, lineFields, oracleFieldLabels, oracleFields, recordFieldLabels, recordFields, type PurchaseListQuery } from '@cenit/contracts/purchases';

type Value = string | number | null;
export type PurchaseExportRow = { id: string; line?: (Record<string, Value> & { position?: number }) | null; [key: string]: unknown };

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const filterLabels = { q: 'Texto', dateFrom: 'Fecha desde', dateTo: 'Fecha hasta', unitCode: 'Unidad', projectCode: 'Código del Proyecto',
  accountingCode: 'Código Contable', paymentSituation: 'Situación de pago' } as const;
const recordKeys = Object.keys(recordFields) as (keyof typeof recordFieldLabels)[];
const oracleKeys = Object.keys(oracleFields) as (keyof typeof oracleFieldLabels)[];
const lineKeys = Object.keys(lineFields) as (keyof typeof lineFieldLabels)[];

export type PurchaseExportMetadata = { query: PurchaseListQuery; generatedAt: string };

export type PurchaseExportBatch =
  | { kind: 'summary'; purchaseCount: number; itemCount: number; documentTotal: string }
  | { kind: 'purchases'; rows: Omit<PurchaseExportRow, 'line'>[] }
  | { kind: 'purchasesComplete' }
  | { kind: 'items'; rows: (NonNullable<PurchaseExportRow['line']> & { requestId: string })[] };

/**
 * «Registro de gastos» repite la planilla del cliente: sus 15 columnas, en su orden y con sus nombres.
 * Al costado van el ID de Cenit y los datos de Oracle; las líneas de cada solicitud quedan en su propia hoja.
 * Todo se escribe como texto para conservar ceros, códigos y montos exactos sin fórmulas.
 */
export async function writePurchaseWorkbook(stream: Writable, read: (consume: (batch: PurchaseExportBatch) => Promise<void>) => Promise<void>, metadata: PurchaseExportMetadata) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useSharedStrings: false, useStyles: true });
  workbook.creator = 'Cenit';
  workbook.created = new Date(metadata.generatedAt);
  const purchaseColumns = [...recordKeys.map(key => [key, recordFieldLabels[key]] as const), ['id', 'ID Cenit'] as const,
    ...oracleKeys.map(key => [key, `Oracle · ${oracleFieldLabels[key]}`] as const)];
  let purchasesSheet: ExcelJS.Worksheet;
  let itemsSheet: ExcelJS.Worksheet;
  await read(async batch => {
    if (stream.destroyed) throw new Error('No se pudo completar el archivo Excel.');
    switch (batch.kind) {
      case 'summary': {
        const summary = workbook.addWorksheet('Resumen');
        summary.columns = [{ header: 'Dato', width: 38 }, { header: 'Valor', width: 70 }];
        summary.getRow(1).font = { bold: true };
        summary.addRow(['Fecha de generación', metadata.generatedAt]).commit();
        summary.addRow(['Orden', metadata.query.sort === 'dateAsc' ? 'Fecha, más antiguas primero' : 'Fecha, más recientes primero']).commit();
        for (const key of Object.keys(filterLabels) as (keyof typeof filterLabels)[]) {
          summary.addRow([filterLabels[key], metadata.query[key] ? text(metadata.query[key]) : 'Todos']).commit();
        }
        summary.addRow(['Compras coincidentes', String(batch.purchaseCount)]).commit();
        summary.addRow(['Líneas de Oracle de esas compras', String(batch.itemCount)]).commit();
        summary.addRow(['Moneda', 'CLP']).commit();
        summary.addRow(['Monto total', batch.documentTotal]).commit();
        summary.commit();
        purchasesSheet = workbook.addWorksheet('Registro de gastos', { views: [{ state: 'frozen', ySplit: 1 }] });
        purchasesSheet.columns = purchaseColumns.map(([key, label]) => ({ header: label, key, width: key === 'description' ? 60 : Math.max(14, label.length + 2) }));
        purchasesSheet.getRow(1).font = { bold: true };
        break;
      }
      case 'purchases':
        for (const row of batch.rows) purchasesSheet.addRow(purchaseColumns.map(([key]) => text(row[key]))).commit();
        break;
      case 'purchasesComplete':
        purchasesSheet.commit();
        itemsSheet = workbook.addWorksheet('Líneas de Oracle', { views: [{ state: 'frozen', ySplit: 1 }] });
        itemsSheet.columns = [
          { header: 'ID Cenit', width: 38 }, { header: 'Línea', width: 10 },
          ...lineKeys.map(key => ({ header: lineFieldLabels[key], width: 24 })),
        ];
        itemsSheet.getRow(1).font = { bold: true };
        break;
      case 'items':
        for (const row of batch.rows) itemsSheet.addRow([text(row.requestId), text(row.position), ...lineKeys.map(key => text(row[key]))]).commit();
        break;
    }
    // Libera las filas entre lotes; cada hoja se cierra antes de abrir la siguiente entrada del ZIP.
    await new Promise<void>(resolve => setImmediate(resolve));
  });
  await workbook.commit();
}
