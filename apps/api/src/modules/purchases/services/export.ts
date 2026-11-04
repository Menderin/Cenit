import ExcelJS from 'exceljs';
import { lineFields, purchaseFieldLabels } from '@cenit/contracts/purchases';

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

export async function createPurchaseWorkbook(rows: PurchaseExportRow[], documentTotal: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cenit';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Compras');
  const columns = [
    ['id', 'ID'], ['requestNumber', purchaseFieldLabels.requestNumber], ['sentDate', purchaseFieldLabels.sentDate],
    ['description', purchaseFieldLabels.description], ['documentType', 'Tipo de documento'], ['reviewStatus', 'Estado'],
    ['totalAmount', purchaseFieldLabels.totalAmount],
    ...Object.keys(lineFields).map(key => [`line_${key}`, purchaseFieldLabels[key] ?? key]),
  ] as Array<[string, string]>;
  sheet.columns = columns.map(([key, label]) => ({ header: label, key, width: key.length > 20 ? 24 : Math.max(12, label.length + 2) }));
  for (const row of rows) {
    const values: Record<string, unknown> = Object.fromEntries([
      ...columns.slice(0, 7).map(([key]) => [key, text(row[key as keyof PurchaseExportRow])]),
      ...Object.entries(row.line ?? {}).map(([key, value]) => [`line_${key}`, text(value)]),
    ]);
    sheet.addRow(values);
  }
  sheet.addRow({ id: '', requestNumber: '', sentDate: '', description: '', documentType: '', reviewStatus: 'Total documental', totalAmount: documentTotal });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
}
