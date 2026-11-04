import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createPurchaseWorkbook, type PurchaseExportRow } from './export.js';

describe('exportación Excel de compras', () => {
  it('conserva valores peligrosos como texto y montos como texto', async () => {
    const row: PurchaseExportRow = {
      id: '00000000-0000-4000-8000-000000000001',
      requestNumber: '=SUMA',
      sentDate: '2026-11-04',
      description: '+texto',
      totalAmount: '100000000000000000000000000000',
      documentType: null,
      reviewStatus: 'pending',
      line: { provider: '@proveedor', price: '9007199254740993' },
    };
    const buffer = await (await createPurchaseWorkbook([row], row.totalAmount)).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Compras')!;
    expect(sheet.getCell('B2').value).toBe('=SUMA');
    expect(sheet.getCell('B2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('D2').value).toBe('+texto');
    expect(sheet.getCell('D2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('G2').value).toBe(row.totalAmount);
    expect(sheet.getCell('G2').type).toBe(ExcelJS.ValueType.String);
    const summary = workbook.getWorksheet('Resumen')!;
    const totalRow = summary.getColumn(1).values.findIndex(value => value === 'Total documental');
    expect(summary.getCell(totalRow, 2).value).toBe(row.totalAmount);
    expect(workbook.getWorksheet('Ítems')!.getCell('A2').value).toBe(row.id);
  });

  it('conserva los cuatro prefijos de fórmula como texto en cabecera e ítems', async () => {
    const prefixes = ['=', '+', '-', '@'];
    const buffer = await (await createPurchaseWorkbook([{
      id: prefixes.join(''),
      requestNumber: prefixes[0]!,
      sentDate: '2026-11-04',
      description: prefixes[1]!,
      totalAmount: '0',
      documentType: null,
      reviewStatus: 'pending',
      line: { provider: prefixes[3]!, description: prefixes[2]! },
    }], '0')).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Compras')!;
    for (const address of ['A2', 'B2', 'D2']) {
      expect(sheet.getCell(address).type).toBe(ExcelJS.ValueType.String);
    }
    expect(sheet.getCell('A2').value).toBe('=+-@');
    expect(sheet.getCell('B2').value).toBe('=');
    expect(sheet.getCell('D2').value).toBe('+');
  });

  it('genera un archivo válido sin resultados', async () => {
    const buffer = await (await createPurchaseWorkbook([], '0')).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.getWorksheet('Compras')?.actualRowCount).toBe(1);
    expect(workbook.getWorksheet('Ítems')?.actualRowCount).toBe(1);
  });

  it('deduplica Compras y conserva cada ítem relacionado por ID', async () => {
    const id = '00000000-0000-4000-8000-000000000002';
    const row = {
      id, requestNumber: '123', sentDate: '2026-11-04', description: 'Compra',
      totalAmount: '150000', documentType: null, reviewStatus: 'reviewed' as const,
    };
    const buffer = await (await createPurchaseWorkbook([
      { ...row, line: { position: 1, provider: 'Uno' } },
      { ...row, line: { position: 2, provider: 'Dos' } },
    ], '150000')).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.getWorksheet('Compras')?.actualRowCount).toBe(2);
    expect(workbook.getWorksheet('Ítems')?.actualRowCount).toBe(3);
    expect(workbook.getWorksheet('Ítems')!.getColumn(1).values.slice(1)).toEqual(['ID Cenit compra', id, id]);
  });
});
