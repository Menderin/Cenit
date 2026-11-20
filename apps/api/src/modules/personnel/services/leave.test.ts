import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { buildAcademicApp } from '../../../app.js';
import type { AcademicReadRepository } from '../../academic/services/academic.js';
import type { AuthService } from '../../auth/services/auth.js';
import type { LeaveRequest } from '@cenit/contracts/personnel';

const origin = 'http://localhost:5173';
const input: LeaveRequest = {
  requestDate: '2026-11-13', name: 'Camila Ejemplo', rut: '15.482.903-2', unit: 'Facultad ficticia', type: 'dia_administrativo',
  from: '2026-11-20', to: '2026-11-20', totalDays: '1', hours: '', minutes: '', startTime: '', endTime: '', recoveryDate: '', notes: 'Trámite personal',
};
const auth = { session: async (cookie: string | undefined) => cookie ? { data: { account: { id: 'test', role: cookie } } } : null } as unknown as AuthService;
const app = buildAcademicApp({ repository: {} as AcademicReadRepository, auth: { service: auth, config: { allowedOrigins: [origin], cookieSecure: false } } });
const url = '/api/v1/personnel/leave-requests/pdf';
const request = (payload: object, role = 'administrativo', requestOrigin = origin) => app.inject({
  method: 'POST', url, headers: { cookie: `cenit_session=${role}`, origin: requestOrigin }, payload,
});
const instructions = async (payload: Buffer) => {
  const contents = (await PDFDocument.load(payload)).getPage(0).node.Contents() as PDFArray;
  return inflateSync((contents.lookup(0) as PDFRawStream).getContents()).toString('latin1');
};
// Texto tal como lo escribe pdf-lib con la fuente estándar (WinAnsi, en hexadecimal).
const shown = (text: string) => `<${Buffer.from(text, 'latin1').toString('hex').toUpperCase()}> Tj`;

describe('PDF provisional de la solicitud de permiso', () => {
  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('exige sesión administrativa y un Origin permitido', async () => {
    expect((await app.inject({ method: 'POST', url, headers: { origin }, payload: input })).statusCode).toBe(401);
    expect((await request(input, 'docente')).statusCode).toBe(403);
    expect((await request(input, 'administrativo', 'https://otro.example')).statusCode).toBe(403);
  });
  it('rechaza entradas fuera del contrato y reglas provisionales inválidas', async () => {
    expect((await request({ ...input, extra: 'invalido' })).statusCode).toBe(400);
    expect((await request({ ...input, type: 'feriado' })).statusCode).toBe(400);
    const response = await request({ ...input, rut: '15.482.903-1', to: '2026-11-19', type: '' });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.fields).toMatchObject({ rut: expect.any(String), to: expect.any(String), type: expect.any(String) });
    const hourly = await request({ ...input, type: 'por_hora', hours: '2', minutes: '0', startTime: '11:00', endTime: '10:00' });
    expect(hourly.json().error.fields).toEqual({ endTime: expect.any(String), recoveryDate: expect.any(String) });
  });
  it('devuelve una hoja carta en memoria con los datos, la marca y la casilla del tipo', async () => {
    const response = await request(input);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    const pdf = await PDFDocument.load(response.rawPayload);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const content = await instructions(response.rawPayload);
    for (const text of ['CAMILA EJEMPLO', '15.482.903-2', 'TRÁMITE PERSONAL', '20', '2026', 'X', 'BORRADOR']) expect(content).toContain(shown(text));
  });
  it('imprime el horario sólo en el permiso por hora', async () => {
    const hidden = await instructions((await request({ ...input, startTime: '09:15', endTime: '11:45' })).rawPayload);
    expect(hidden).not.toContain(shown('09:15'));
    const hourly = await request({ ...input, type: 'por_hora', hours: '2', minutes: '30', startTime: '09:15', endTime: '11:45', recoveryDate: '2026-11-27' });
    expect(hourly.statusCode).toBe(200);
    const content = await instructions(hourly.rawPayload);
    for (const text of ['09:15', '11:45', '30', '27']) expect(content).toContain(shown(text));
  });
  it('rechaza textos que no caben y caracteres no soportados sin devolver un PDF cortado', async () => {
    const long = await request({ ...input, notes: 'X'.repeat(500) });
    expect(long.statusCode).toBe(422);
    expect(long.json().error.fields.notes).toBeTruthy();
    const unsupported = await request({ ...input, unit: 'Unidad 🐙' });
    expect(unsupported.json().error.fields.unit).toBeTruthy();
  });
});
