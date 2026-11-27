import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { lineFieldLabels, lineFields, oracleFieldLabels, oracleFields, recordFieldLabels, recordFields } from '@cenit/contracts/purchases';
import type { SheetsJob, PurchaseSheetsRepository } from '../repositories/sheets.js';

export type SheetsCall = (path: string, body?: unknown) => Promise<unknown>;
const metaSchema = Type.Object({ sheets: Type.Array(Type.Object({ properties: Type.Object({
  sheetId: Type.Integer(), title: Type.String(), gridProperties: Type.Object({ rowCount: Type.Integer(), columnCount: Type.Integer() }),
}), protectedRanges: Type.Optional(Type.Array(Type.Object({ description: Type.Optional(Type.String()) }))) })) });
const valuesSchema = Type.Object({ valueRanges: Type.Array(Type.Object({ values: Type.Optional(Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean()])))) })) });
const recordKeys = Object.keys(recordFields) as (keyof typeof recordFieldLabels)[];
const oracleKeys = Object.keys(oracleFields) as (keyof typeof oracleFieldLabels)[];
const lineKeys = Object.keys(lineFields) as (keyof typeof lineFieldLabels)[];
// «Compras» sigue el orden del «Registro de gastos» del cliente; después, los datos de Oracle y de Cenit.
const columns = {
  Compras: ['ID Cenit', ...recordKeys.map(key => recordFieldLabels[key]), ...oracleKeys.map(key => `Oracle · ${oracleFieldLabels[key]}`),
    'Procedencia', 'Ejemplo', 'Registrado el', 'Registrado por', 'Versión', 'ID extracción', 'Procesador', 'Procesado el'],
  Ítems: ['ID Cenit', 'Línea', ...lineKeys.map(key => lineFieldLabels[key])],
};
const titles = ['Compras', 'Ítems'] as const;
const protection = 'Cenit: datos administrados';
const fields = (keys: string[], data: Record<string, string | null>) => keys.map(key => data[key] ?? '');

function headerValues(job: SheetsJob): string[] {
  const r = job.record;
  return !r ? [] : [job.id, ...fields(recordKeys, r.record), ...fields(oracleKeys, r.oracle), r.source, r.exampleId ?? '',
    r.createdAt, r.createdBy.name, String(r.version),
    r.capture?.extractionId ?? '', r.capture?.processorVersion ?? '', r.capture?.processedAt ?? ''];
}

export class GoogleSheetsWriter {
  constructor(private readonly call: SheetsCall, private readonly serviceEmail: string) {}

  async send(jobs: SheetsJob[]) {
    const metadata = await this.call('?fields=sheets(properties,protectedRanges(description))');
    if (!Value.Check(metaSchema, metadata)) throw new Error('SHEETS_INVALID_RESPONSE');
    const requests: unknown[] = [];
    const updates: { title: typeof titles[number]; row: number; id: string; position?: number; values: string[] }[] = [];
    for (const job of jobs) {
      if (job.headerRow) updates.push({ title: 'Compras', row: job.headerRow, id: job.id, values: headerValues(job) });
      job.itemRows.forEach((row, i) => updates.push({ title: 'Ítems', row, id: job.id, position: i + 1,
        values: job.record?.lines[i] ? [job.id, String(i + 1), ...fields(lineKeys, job.record.lines[i]!)] : [] }));
    }
    const sheets = new Map<typeof titles[number], number>();
    const reads: { title: typeof titles[number]; start: number; end: number }[] = [];
    for (const [index, title] of titles.entries()) {
      const existing = metadata.sheets.find(sheet => sheet.properties.title === title);
      const sheetId = existing?.properties.sheetId ?? 182001 + index;
      if (!existing && metadata.sheets.some(sheet => sheet.properties.sheetId === sheetId)) throw new Error('SHEETS_LAYOUT_CHANGED');
      sheets.set(title, sheetId);
      const rows = [...new Set(updates.filter(update => update.title === title).map(update => update.row))].sort((a, b) => a - b);
      const maxRow = Math.max(2, ...rows), width = columns[title].length;
      if (!existing) {
        requests.push({ addSheet: { properties: { sheetId, title, gridProperties: { rowCount: Math.max(1000, maxRow), columnCount: width, frozenRowCount: 1 } } } });
        requests.push({ addProtectedRange: { protectedRange: { range: { sheetId }, description: protection, warningOnly: false, editors: { users: [this.serviceEmail] } } } });
      } else {
        if (!existing.protectedRanges?.some(range => range.description === protection)) throw new Error('SHEETS_LAYOUT_CHANGED');
        if (existing.properties.gridProperties.columnCount < width) throw new Error('SHEETS_LAYOUT_CHANGED');
        reads.push({ title, start: 1, end: 1 });
        for (const row of rows.filter(row => row <= existing.properties.gridProperties.rowCount)) {
          const previous = reads.at(-1);
          if (previous?.title === title && previous.end + 1 === row) previous.end = row;
          else reads.push({ title, start: row, end: row });
        }
        if (maxRow > existing.properties.gridProperties.rowCount) requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: maxRow } }, fields: 'gridProperties.rowCount' } });
      }
      requests.push(this.update(sheetId, 1, columns[title], width));
    }
    if (reads.length) {
      const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
      for (const range of reads) query.append('ranges', `'${range.title}'!A${range.start}:${this.columnName(columns[range.title].length)}${range.end}`);
      const response = await this.call(`/values:batchGet?${query}`);
      if (!Value.Check(valuesSchema, response) || response.valueRanges.length !== reads.length) throw new Error('SHEETS_INVALID_RESPONSE');
      for (const [i, range] of reads.entries()) {
        const values = response.valueRanges[i]!.values ?? [];
        for (let row = range.start; row <= range.end; row++) {
          const current = values[row - range.start] ?? [];
          if (row === 1) {
            if (JSON.stringify(current) !== JSON.stringify(columns[range.title])) throw new Error('SHEETS_LAYOUT_CHANGED');
          } else {
            const expected = updates.find(update => update.title === range.title && update.row === row)!;
            if (current.some(value => value !== '') && (current[0] !== expected.id ||
              expected.position !== undefined && String(current[1]) !== String(expected.position))) throw new Error('SHEETS_LAYOUT_CHANGED');
          }
        }
      }
    }
    for (const update of updates) requests.push(this.update(sheets.get(update.title)!, update.row, update.values, columns[update.title].length));
    // Explicit stringValue preserves identifiers, exact amounts and formula-like text.
    // Fixed row assignments make this atomic batch safe to repeat after a timeout.
    await this.call(':batchUpdate', { requests });
  }

  private update(sheetId: number, row: number, values: string[], width: number) {
    return { updateCells: { range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 0, endColumnIndex: width },
      rows: [{ values: Array.from({ length: width }, (_, i) => values[i] ? { userEnteredValue: { stringValue: values[i] } } : {}) }], fields: 'userEnteredValue' } };
  }
  private columnName(index: number) {
    let result = '';
    for (; index; index = Math.floor((index - 1) / 26)) result = String.fromCharCode(65 + (index - 1) % 26) + result;
    return result;
  }
}

export function createGoogleSheetsWriter(spreadsheetId: string, keyFile: string) {
  const key: unknown = JSON.parse(readFileSync(keyFile, 'utf8'));
  if (!Value.Check(Type.Object({ type: Type.Literal('service_account'), client_email: Type.String({ minLength: 3 }), private_key: Type.String({ minLength: 1 }) }), key)) throw new Error('Credencial de Sheets inválida.');
  const auth = new GoogleAuth({ keyFilename: keyFile, clientOptions: { transporterOptions: { timeout: 20_000, retry: false } }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  return new GoogleSheetsWriter(async (path, body) => {
    const token = await auth.getAccessToken();
    if (!token) throw new Error('SHEETS_AUTH_FAILED');
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error('SHEETS_REQUEST_FAILED');
    return response.json();
  }, key.client_email);
}

export function readSheetsTarget(env = process.env) {
  const spreadsheetId = env.CENIT_PURCHASE_SHEETS_ID, keyFile = env.CENIT_PURCHASE_SHEETS_KEY_FILE;
  if (!spreadsheetId || !/^[a-zA-Z0-9_-]{10,200}$/.test(spreadsheetId) || !keyFile) throw new Error('Falta configurar el destino y la credencial de Sheets.');
  return { spreadsheetId, keyFile };
}

export function startSheetsSync(repository: PurchaseSheetsRepository, spreadsheetId: string, writer: GoogleSheetsWriter) {
  let running: Promise<void> | undefined;
  const tick = () => { if (!running) running = repository.deliver(spreadsheetId, jobs => writer.send(jobs)).catch(() => {
    console.error('No se pudo procesar la cola de Sheets. Se reintentará.');
  }).finally(() => { running = undefined; }); };
  const timer = setInterval(tick, 15_000);
  timer.unref(); tick();
  return async () => { clearInterval(timer); await running; };
}
