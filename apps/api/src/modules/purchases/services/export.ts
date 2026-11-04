import ExcelJS from 'exceljs';
import { lineFields, purchaseFieldLabels, type PurchaseListQuery } from '@cenit/contracts/purchases';

export type PurchaseExportRow = {
  id: string;
  requestNumber: string;
  sentDate: string;
  description: string;
  totalAmount: string;
  documentType: string | null;
  reviewStatus: 'pending' | 'reviewed';
  line: Record<string, string | null> | null;
};

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const filterLabels = { q: 'Texto', dateFrom: 'Fecha desde', dateTo: 'Fecha hasta', unitCode: 'Código de unidad', projectCode: 'Código de proyecto' } as const;

export type PurchaseExportMetadata = { query: PurchaseListQuery; generatedAt: string };

export async function createPurchaseWorkbook(rows: PurchaseExportRow[], documentTotal: string, metadata?: PurchaseExportMetadata) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cenit';
  workbook.created = new Date();
  const uniquePurchases = [...new Map(rows.map(row => [row.id, row])).values()];

  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [
    { header: 'Dato', key: 'key', width: 24 },
    { header: 'Valor', key: 'value', width: 70 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow(['Fecha de generación', metadata?.generatedAt ?? workbook.created.toISOString()]);
  summary.addRow(['Estado', metadata?.query.reviewStatus ?? 'all']);
  summary.addRow(['Orden', metadata?.query.sort ?? 'sentDateDesc']);
  if (metadata) {
    for (const key of ['q', 'dateFrom', 'dateTo', 'unitCode', 'projectCode'] as const) {
      summary.addRow([filterLabels[key], metadata.query[key] ? text(metadata.query[key]) : 'Todos']);
    }
  }
  summary.addRow(['Compras coincidentes', String(uniquePurchases.length)]);
  summary.addRow(['Ítems coincidentes', String(rows.filter(row => row.line).length)]);
  summary.addRow(['Total documental', documentTotal]);

  const purchaseColumns = [
    ['id', 'ID'], ['requestNumber', purchaseFieldLabels.requestNumber], ['sentDate', purchaseFieldLabels.sentDate],
    ['description', purchaseFieldLabels.description], ['documentType', 'Tipo de documento'], ['reviewStatus', 'Estado'],
    ['totalAmount', purchaseFieldLabels.totalAmount],
  ] as Array<[string, string]>;
  const purchasesSheet = workbook.addWorksheet('Compras');
  purchasesSheet.columns = purchaseColumns.map(([key, label]) => ({ header: label, key, width: key.length > 20 ? 24 : Math.max(12, label.length + 2) }));
  for (const row of uniquePurchases) {
    purchasesSheet.addRow(purchaseColumns.map(([key]) => text(row[key as keyof PurchaseExportRow])));
  }
  purchasesSheet.getRow(1).font = { bold: true };
  purchasesSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const itemsSheet = workbook.addWorksheet('Ítems');
  const itemKeys = Object.keys(lineFields);
  itemsSheet.columns = [
    { header: 'ID Cenit compra', key: 'purchaseId', width: 38 },
    { header: 'Posición', key: 'position', width: 12 },
    ...itemKeys.map(key => ({ header: purchaseFieldLabels[key] ?? key, key, width: 24 })),
  ];
  for (const row of rows) {
    if (!row.line) continue;
    itemsSheet.addRow([text(row.id), text(row.line.position), ...itemKeys.map(key => text(row.line![key]))]);
  }
  itemsSheet.getRow(1).font = { bold: true };
  itemsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
}
