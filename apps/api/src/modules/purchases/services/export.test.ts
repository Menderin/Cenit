import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { writePurchaseWorkbook, type PurchaseExportRow } from './export.js';
import { PurchaseService } from './purchases.js';
import type { PurchaseRepository } from '../repositories/purchases.js';

async function workbookBuffer(rows: PurchaseExportRow[], documentTotal: string) {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
  await writePurchaseWorkbook(stream, async consume => {
    const purchases = [...new Map(rows.map(row => [row.id, row])).values()];
    const items = rows.flatMap(row => row.line ? [{ ...row.line, requestId: row.id }] : []);
    // Una fila por compra en «Registro de gastos», como en la planilla del cliente.
    await consume({ kind: 'summary', purchaseCount: purchases.length, itemCount: items.length, documentTotal });
    await consume({ kind: 'purchases', rows: purchases });
    await consume({ kind: 'purchasesComplete' });
    await consume({ kind: 'items', rows: items });
  }, { query: { page: 1, pageSize: 20 }, generatedAt: '2026-11-04T12:00:00.000Z' });
  return Buffer.concat(chunks);
}

describe('exportación Excel de compras', () => {
  it('conserva valores peligrosos como texto y montos como texto', async () => {
    const row: PurchaseExportRow = {
      id: '00000000-0000-4000-8000-000000000001',
      recordDate: '2026-11-04',
      requestNumber: '=SUMA',
      description: '+texto',
      totalAmount: '100000000000000000000000000000',
      documentType: null,
      line: { provider: '@proveedor', price: '9007199254740993' },
    };
    const buffer = await workbookBuffer([row], String(row.totalAmount));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Registro de gastos')!;
    expect(sheet.getRow(1).values).toEqual([undefined, 'Fecha', 'Documento', 'Nº Documento', 'PROVEEDOR', 'DETALLE', 'Monto', 'Tipo documento', 'bi', 'Unidad',
      'Código del Proyecto', 'Código Contable', 'RUT', 'UNIDAD', 'ITEM', 'Situación de pago', 'ID Cenit', 'Oracle · Fecha de envío', 'Oracle · Hora de envío',
      'Oracle · ID de Oracle', 'Oracle · Desde', 'Oracle · A', 'Oracle · Impuesto', 'Oracle · Anexos']);
    expect(sheet.getCell('C2').value).toBe('=SUMA');
    expect(sheet.getCell('C2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('E2').value).toBe('+texto');
    expect(sheet.getCell('E2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('F2').value).toBe(row.totalAmount);
    expect(sheet.getCell('F2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('P2').value).toBe(row.id);
    const summary = workbook.getWorksheet('Resumen')!;
    const totalRow = summary.getColumn(1).values.findIndex(value => value === 'Monto total');
    expect(summary.getCell(totalRow, 2).value).toBe(row.totalAmount);
    expect(workbook.getWorksheet('Líneas de Oracle')!.getCell('A2').value).toBe(row.id);
  });

  it('conserva los cuatro prefijos de fórmula como texto en cabecera e ítems', async () => {
    const prefixes = ['=', '+', '-', '@'];
    const buffer = await workbookBuffer([{
      id: prefixes.join(''),
      recordDate: '2026-11-04',
      requestNumber: prefixes[0]!,
      description: prefixes[1]!,
      totalAmount: '0',
      documentType: null,
      line: { provider: prefixes[3]!, description: prefixes[2]! },
    }], '0');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Registro de gastos')!;
    for (const address of ['P2', 'C2', 'E2']) {
      expect(sheet.getCell(address).type).toBe(ExcelJS.ValueType.String);
    }
    expect(sheet.getCell('P2').value).toBe('=+-@');
    expect(sheet.getCell('C2').value).toBe('=');
    expect(sheet.getCell('E2').value).toBe('+');
    const lines = workbook.getWorksheet('Líneas de Oracle')!;
    expect(lines.getCell('D2').value).toBe('@');
    expect(lines.getCell('D2').type).toBe(ExcelJS.ValueType.String);
  });

  it('genera un archivo válido sin resultados', async () => {
    const buffer = await workbookBuffer([], '0');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.getWorksheet('Registro de gastos')?.actualRowCount).toBe(1);
    expect(workbook.getWorksheet('Líneas de Oracle')?.actualRowCount).toBe(1);
  });

  it('deduplica Compras y conserva cada ítem relacionado por ID', async () => {
    const id = '00000000-0000-4000-8000-000000000002';
    const row = {
      id, recordDate: '2026-11-04', requestNumber: '123', description: 'Compra',
      totalAmount: '150000', documentType: null, paymentSituation: 'PAGADO',
    };
    const buffer = await workbookBuffer([
      { ...row, line: { position: 1, provider: 'Uno' } },
      { ...row, line: { position: 2, provider: 'Dos' } },
    ], '150000');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.getWorksheet('Registro de gastos')?.actualRowCount).toBe(2);
    expect(workbook.getWorksheet('Líneas de Oracle')?.actualRowCount).toBe(3);
    expect(workbook.getWorksheet('Líneas de Oracle')!.getColumn(1).values.slice(1)).toEqual(['ID Cenit', id, id]);
  });
  it('detiene la lectura cuando se cierra la salida del archivo', async () => {
    const output = new PassThrough();
    await expect(writePurchaseWorkbook(output, async consume => {
      output.destroy();
      await consume({ kind: 'summary', purchaseCount: 0, itemCount: 0, documentTotal: '0' });
    }, { query: { page: 1, pageSize: 20 }, generatedAt: '2026-11-04T12:00:00.000Z' })).rejects.toThrow('No se pudo completar el archivo Excel.');
  });
  it.each(['read-failure', 'cancelled'] as const)('retira el archivo temporal ante %s sin entregar una descarga', async reason => {
    const before = (await readdir(tmpdir())).filter(name => name.startsWith('cenit-export-')).sort();
    const controller = new AbortController();
    const repository = {
      export: async () => {
        if (reason === 'cancelled') {
          controller.abort();
          controller.signal.throwIfAborted();
        }
        throw new Error('Fallo ficticio de lectura.');
      },
    } as unknown as PurchaseRepository;
    const service = new PurchaseService(repository);
    await expect(service.export({ page: 1, pageSize: 20 }, controller.signal)).rejects.toThrow();
    expect((await readdir(tmpdir())).filter(name => name.startsWith('cenit-export-')).sort()).toEqual(before);
  });
});
