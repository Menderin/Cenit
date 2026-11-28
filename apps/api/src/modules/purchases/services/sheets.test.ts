import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import type { PurchaseRecord } from '@cenit/contracts/purchases';
import { manualPurchaseExample } from '../../../../../../packages/contracts/src/purchases/record-examples.js';
import { FakeGoogleSheets } from '../../../../../../tests/support/google-sheets.js';
import { createGoogleSheetsWriter, GoogleSheetsWriter, readSheetsTarget } from './sheets.js';
import { readPurchaseCapabilities } from './config.js';
import type { SheetsJob } from '../repositories/sheets.js';

function job(): SheetsJob {
  const record: PurchaseRecord = { ...structuredClone(manualPurchaseExample), id: '00000000-0000-4000-8000-000000000100', source: 'manual', exampleId: null,
    version: 1, createdAt: '2026-10-21T00:00:00.000Z', createdBy: { id: '00000000-0000-4000-8000-000000000001', name: 'Cuenta ficticia' } };
  record.record.totalAmount = '9'.repeat(255); record.record.requestNumber = '0000123'; record.record.description = '=SUM(A1:A2)';
  return { id: record.id, generation: 1, headerRow: 2, itemRows: record.lines.map((_, i) => i + 2), record };
}
describe('Sheets: proyección literal e idempotente', () => {
  it('desactiva Sheets por defecto y rechaza configuraciones incompletas', () => {
    expect(readPurchaseCapabilities({})).toEqual({ sheetsSyncEnabled: false });
    expect(readPurchaseCapabilities({ CENIT_PURCHASE_SHEETS_SYNC_ENABLED: 'true' }).sheetsSyncEnabled).toBe(true);
    expect(() => readPurchaseCapabilities({ CENIT_PURCHASE_SHEETS_SYNC_ENABLED: 'yes' })).toThrow();
    expect(() => readSheetsTarget({})).toThrow();
    expect(() => readSheetsTarget({ CENIT_PURCHASE_SHEETS_ID: 'https://example.test', CENIT_PURCHASE_SHEETS_KEY_FILE: 'fake' })).toThrow();
  });
  it('conserva montos, ceros, textos y varios ítems; repetir no agrega filas', async () => {
    const remote = new FakeGoogleSheets(), writer = new GoogleSheetsWriter(remote.call, 'fake@example.test'), current = job();
    await writer.send([current]); await writer.send([current]);
    const headers = remote.sheet('Compras').rows.get(1)!, values = remote.sheet('Compras').rows.get(2)!;
    expect(headers.slice(1, 16)).toEqual(['Fecha', 'Documento', 'Nº Documento', 'PROVEEDOR', 'DETALLE', 'Monto', 'Tipo documento', 'bi', 'Unidad',
      'Código del Proyecto', 'Código Contable', 'RUT', 'UNIDAD', 'ITEM', 'Situación de pago']);
    expect(values[headers.indexOf('Monto')]).toBe('9'.repeat(255));
    expect(values[headers.indexOf('Nº Documento')]).toBe('0000123');
    expect(values[headers.indexOf('DETALLE')]).toBe('=SUM(A1:A2)');
    expect(remote.sheet('Compras').rows.size).toBe(2);
    expect(remote.sheet('Ítems').rows.size).toBe(current.itemRows.length + 1);
  });
  it('recupera una respuesta perdida y retira cabecera e ítems sin desplazar otras filas', async () => {
    const remote = new FakeGoogleSheets(), writer = new GoogleSheetsWriter(remote.call, 'fake@example.test'), current = job();
    remote.loseNextResponse = true;
    await expect(writer.send([current])).rejects.toThrow();
    await writer.send([current]);
    expect(remote.sheet('Compras').rows.size).toBe(2);
    await writer.send([{ ...current, record: null, generation: 2 }]);
    expect(remote.sheet('Compras').rows.get(2)!.every(value => value === '')).toBe(true);
    for (const row of current.itemRows) expect(remote.sheet('Ítems').rows.get(row)!.every(value => value === '')).toBe(true);
  });
  it('rechaza filas desplazadas, cabeceras cambiadas y protecciones retiradas', async () => {
    for (const alter of [
      (remote: FakeGoogleSheets) => { remote.sheet('Compras').rows.get(2)![0] = 'otro-registro'; },
      (remote: FakeGoogleSheets) => { remote.sheet('Compras').rows.get(1)![0] = 'Otra columna'; },
      (remote: FakeGoogleSheets) => { remote.sheet('Compras').protectedRanges = []; },
    ]) {
      const remote = new FakeGoogleSheets(), writer = new GoogleSheetsWriter(remote.call, 'fake@example.test');
      await writer.send([job()]); alter(remote);
      await expect(writer.send([job()])).rejects.toThrow('SHEETS_LAYOUT_CHANGED');
      expect(remote.writes).toBe(1);
    }
  });
  it('autentica sólo las llamadas de servidor a Sheets y rechaza respuestas HTTP fallidas', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cenit-sheets-unit-')), keyFile = join(directory, 'fake-key.json');
    writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'fake@example.test', private_key: 'fake-unit-key' }), { mode: 0o600 });
    const token = vi.spyOn(GoogleAuth.prototype, 'getAccessToken').mockResolvedValue('fake-unit-token');
    let unavailable = false;
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(new URL(url).origin).toBe('https://sheets.googleapis.com');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fake-unit-token');
      return new Response(JSON.stringify(url.includes('?fields=') ? { sheets: [] } : {}), { status: unavailable ? 403 : 200 });
    });
    vi.stubGlobal('fetch', request);
    try {
      const writer = createGoogleSheetsWriter('fake_unit_spreadsheet', keyFile);
      await writer.send([job()]);
      expect(request.mock.calls.at(-1)![0]).toBe('https://sheets.googleapis.com/v4/spreadsheets/fake_unit_spreadsheet:batchUpdate');
      expect(request.mock.calls.at(-1)![1].method).toBe('POST');
      unavailable = true;
      await expect(writer.send([job()])).rejects.toThrow('SHEETS_REQUEST_FAILED');
    } finally { token.mockRestore(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true }); }
  });
});
