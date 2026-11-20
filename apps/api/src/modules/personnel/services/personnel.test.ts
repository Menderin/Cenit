import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { buildAcademicApp } from '../../../app.js';
import type { AcademicReadRepository } from '../../academic/services/academic.js';
import type { AuthService } from '../../auth/services/auth.js';
import type { ServiceCommission } from '@cenit/contracts/personnel';

const origin = 'http://localhost:5173';
const input: ServiceCommission = {
  name: 'María Ejemplo', position: 'Docente', unit: 'Facultad de Medicina', group: 'I', category: 'academico', categoryOther: '',
  plant: 'oficial', territory: 'nacional', place: 'Antofagasta', from: '2026-11-10', to: '2026-11-11',
  daysWithStay: '1', daysWithoutStay: '', totalDays: '1½', allowance: '27.000', currency: 'CLP',
  funding: [{ institution: '0001', organization: '02', unit: '000003', project: '00000004', percent: '100' },
    { institution: '', organization: '', unit: '', project: '', percent: '' }],
  activity: 'evento', eventName: 'Congreso de nutrición', eventOrganizer: 'Institución ficticia', eventWork: '', eventProject: '', eventNotes: '', description: '',
};
const auth = { session: async (cookie: string | undefined) => cookie ? { data: { account: { id: 'test', role: cookie } } } : null } as unknown as AuthService;
const app = buildAcademicApp({ repository: {} as AcademicReadRepository, auth: { service: auth, config: { allowedOrigins: [origin], cookieSecure: false } } });
const request = (payload: object, role = 'administrativo', requestOrigin = origin) => app.inject({
  method: 'POST', url: '/api/v1/personnel/service-commissions/pdf', headers: { cookie: `cenit_session=${role}`, origin: requestOrigin }, payload,
});
const pdfInstructions = (pdf: PDFDocument) => {
  const contents = pdf.getPage(0).node.Contents();
  expect(contents).toBeInstanceOf(PDFArray);
  const stream = (contents as PDFArray).lookup(0);
  expect(stream).toBeInstanceOf(PDFRawStream);
  return inflateSync((stream as PDFRawStream).getContents()).toString('latin1');
};

describe('PDF provisional de comisión', () => {
  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('exige sesión administrativa y un Origin permitido', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/personnel/service-commissions/pdf', headers: { origin }, payload: input })).statusCode).toBe(401);
    expect((await request(input, 'docente')).statusCode).toBe(403);
    expect((await request(input, 'administrativo', 'https://otro.example')).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/personnel/service-commissions/pdf', headers: { cookie: 'cenit_session=administrativo' }, payload: input })).statusCode).toBe(403);
  });
  it('rechaza entradas fuera del contrato y reglas provisionales inválidas', async () => {
    expect((await request({ ...input, extra: 'invalido' })).statusCode).toBe(400);
    const response = await request({ ...input, from: '2026-02-30', to: '2026-02-28', funding: [input.funding[0], { ...input.funding[1], project: '001' }] });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.fields).toMatchObject({ from: expect.any(String), 'funding.1.institution': expect.any(String) });
  });
  it('devuelve una hoja carta en memoria con la plantilla y valores ficticios', async () => {
    const response = await request(input);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    const pdf = await PDFDocument.load(response.rawPayload);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const instructions = pdfInstructions(pdf);
    // Bytes WinAnsi de los valores y de la marca, sin depender de un extractor externo.
    expect(instructions).toContain('<4D4152CD4120454A454D504C4F> Tj');
    expect(instructions).toContain('<31302F6E6F762F3236> Tj');
    expect(instructions).toContain('<424F525241444F52> Tj');
  });
  it('imprime la descripción elegida sin incorporar los datos ocultos del evento', async () => {
    const response = await request({ ...input, activity: 'descripcion', description: 'Trabajo en terreno', eventName: 'NOMBRE OCULTO' });
    expect(response.statusCode).toBe(200);
    const instructions = pdfInstructions(await PDFDocument.load(response.rawPayload));
    expect(instructions).toContain('<54524142414A4F20454E2054455252454E4F> Tj');
    expect(instructions).not.toContain('<4E4F4D425245204F43554C544F> Tj');
  });
  it('rechaza textos que no caben y caracteres no soportados sin devolver un PDF cortado', async () => {
    const long = await request({ ...input, name: 'X'.repeat(500) });
    expect(long.statusCode).toBe(422);
    expect(long.json().error.fields.name).toBeTruthy();
    const unsupported = await request({ ...input, name: 'Ejemplo 🐙' });
    expect(unsupported.statusCode).toBe(422);
    expect(unsupported.json().error.fields.name).toBeTruthy();
    const control = await request({ ...input, name: 'Ejemplo\u0000' });
    expect(control.statusCode).toBe(422);
    expect(control.json().error.fields.name).toBeTruthy();
  });
});
