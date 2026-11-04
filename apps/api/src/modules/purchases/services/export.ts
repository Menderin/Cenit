import ExcelJS from 'exceljs';
import type { Writable } from 'node:stream';
import { lineFields, purchaseFieldLabels, type PurchaseListQuery } from '@cenit/contracts/purchases';

export type PurchaseExportRow = {
  id: string;
  requestNumber: string;
  sentDate: string;
  description: string;
  totalAmount: string;
  documentType: string | null;
  reviewStatus: 'pending' | 'reviewed';
  line: (Record<string, string | number | null> & { position?: number }) | null;
};

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const filterLabels = { q: 'Texto', dateFrom: 'Fecha desde', dateTo: 'Fecha hasta', unitCode: 'Código de unidad', projectCode: 'Código de proyecto' } as const;

export type PurchaseExportMetadata = { query: PurchaseListQuery; generatedAt: string };

export type PurchaseExportBatch =
  | { kind: 'summary'; purchaseCount: number; itemCount: number; documentTotal: string }
  | { kind: 'purchases'; rows: Omit<PurchaseExportRow, 'line'>[] }
  | { kind: 'purchasesComplete' }
  | { kind: 'items'; rows: (NonNullable<PurchaseExportRow['line']> & { requestId: string })[] };

export async function writePurchaseWorkbook(stream: Writable, read: (consume: (batch: PurchaseExportBatch) => Promise<void>) => Promise<void>, metadata: PurchaseExportMetadata) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useSharedStrings: false, useStyles: true });
  workbook.creator = 'Cenit';
  workbook.created = new Date(metadata.generatedAt);
  const purchaseColumns = [
    ['id', 'ID'], ['requestNumber', purchaseFieldLabels.requestNumber], ['sentDate', purchaseFieldLabels.sentDate],
    ['description', purchaseFieldLabels.description], ['documentType', 'Tipo de documento'], ['reviewStatus', 'Estado'],
    ['totalAmount', purchaseFieldLabels.totalAmount],
  ] as const;
  const itemKeys = Object.keys(lineFields);
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
        summary.addRow(['Estado', metadata.query.reviewStatus]).commit();
        summary.addRow(['Orden', metadata.query.sort ?? 'sentDateDesc']).commit();
        for (const key of ['q', 'dateFrom', 'dateTo', 'unitCode', 'projectCode'] as const) {
          summary.addRow([filterLabels[key], metadata.query[key] ? text(metadata.query[key]) : 'Todos']).commit();
        }
        summary.addRow(['Compras coincidentes', String(batch.purchaseCount)]).commit();
        summary.addRow(['Ítems de las compras coincidentes', String(batch.itemCount)]).commit();
        summary.addRow(['Moneda', 'CLP']).commit();
        summary.addRow(['Total documental', batch.documentTotal]).commit();
        summary.commit();
        purchasesSheet = workbook.addWorksheet('Compras', { views: [{ state: 'frozen', ySplit: 1 }] });
        purchasesSheet.columns = purchaseColumns.map(([key, label]) => ({ header: label ?? key, key, width: Math.max(14, (label ?? key).length + 2) }));
        purchasesSheet.getRow(1).font = { bold: true };
        break;
      }
      case 'purchases':
        for (const row of batch.rows) purchasesSheet.addRow(purchaseColumns.map(([key]) => text(row[key]))).commit();
        break;
      case 'purchasesComplete':
        purchasesSheet.commit();
        itemsSheet = workbook.addWorksheet('Ítems', { views: [{ state: 'frozen', ySplit: 1 }] });
        itemsSheet.columns = [
          { header: 'ID Cenit compra', width: 38 }, { header: 'Posición', width: 12 },
          ...itemKeys.map(key => ({ header: purchaseFieldLabels[key] ?? key, width: 24 })),
        ];
        itemsSheet.getRow(1).font = { bold: true };
        break;
      case 'items':
        for (const row of batch.rows) itemsSheet.addRow([text(row.requestId), text(row.position), ...itemKeys.map(key => text(row[key]))]).commit();
        break;
    }
    // Release row objects between batches; each worksheet is closed before opening the next ZIP entry.
    await new Promise<void>(resolve => setImmediate(resolve));
  });
  await workbook.commit();
}
