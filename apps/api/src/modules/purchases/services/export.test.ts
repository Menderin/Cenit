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
    await consume({ kind: 'summary', purchaseCount: purchases.length, itemCount: items.length, documentTotal });
    await consume({ kind: 'purchases', rows: purchases });
    await consume({ kind: 'purchasesComplete' });
    await consume({ kind: 'items', rows: items });
  }, { query: { reviewStatus: 'all', page: 1, pageSize: 20 }, generatedAt: '2026-11-04T12:00:00.000Z' });
  return Buffer.concat(chunks);
}

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
    const buffer = await workbookBuffer([row], row.totalAmount);
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
    const buffer = await workbookBuffer([{
      id: prefixes.join(''),
      requestNumber: prefixes[0]!,
      sentDate: '2026-11-04',
      description: prefixes[1]!,
      totalAmount: '0',
      documentType: null,
      reviewStatus: 'pending',
      line: { provider: prefixes[3]!, description: prefixes[2]! },
    }], '0');
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
    const buffer = await workbookBuffer([], '0');
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
    const buffer = await workbookBuffer([
      { ...row, line: { position: 1, provider: 'Uno' } },
      { ...row, line: { position: 2, provider: 'Dos' } },
    ], '150000');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.getWorksheet('Compras')?.actualRowCount).toBe(2);
    expect(workbook.getWorksheet('Ítems')?.actualRowCount).toBe(3);
    expect(workbook.getWorksheet('Ítems')!.getColumn(1).values.slice(1)).toEqual(['ID Cenit compra', id, id]);
  });
  it('detiene la lectura cuando se cierra la salida del archivo', async () => {
    const output = new PassThrough();
    await expect(writePurchaseWorkbook(output, async consume => {
      output.destroy();
      await consume({ kind: 'summary', purchaseCount: 0, itemCount: 0, documentTotal: '0' });
    }, { query: { reviewStatus: 'all', page: 1, pageSize: 20 }, generatedAt: '2026-11-04T12:00:00.000Z' })).rejects.toThrow('No se pudo completar el archivo Excel.');
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
    await expect(service.export({ reviewStatus: 'all', page: 1, pageSize: 20 }, controller.signal)).rejects.toThrow();
    expect((await readdir(tmpdir())).filter(name => name.startsWith('cenit-export-')).sort()).toEqual(before);
  });
});
