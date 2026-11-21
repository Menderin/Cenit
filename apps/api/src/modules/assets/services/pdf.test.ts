import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import type { AssetDetail, Delivery, DocumentItem, Loan } from '@cenit/contracts/assets';
import { unprintableChar } from '../../../infrastructure/forms.js';
import { altaPdf, deliveryPdf, loanPdf } from './pdf.js';

const item = (index: number, description = `Bien ficticio ${index}`): DocumentItem => ({
  assetId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, code: `BN-${String(index).padStart(4, '0')}`, quantity: 1, kind: 'equipo', description,
  brand: 'Marca', model: 'Modelo', serialNumber: `SERIE${index}`, material: null, dimensions: null,
});
const person = { id: '00000000-0000-4000-8000-0000000000bb', name: 'Persona Ficticia', rut: '11.111.111-1', unit: 'Docencia', position: 'Docente', active: true, inactiveSince: null, assetCount: 0 };
const delivery = (items: DocumentItem[], reason = 'Para uso docente'): Delivery => ({
  id: '00000000-0000-4000-8000-0000000000aa', number: '008/2026', deliveredOn: '2026-11-17', reason, destination: null, giverName: 'Entrega Ficticio', giverPosition: 'Coordinación', giverUnit: 'Facultad ficticia', notes: null,
  receiver: person, items, createdAt: '2026-11-17T12:00:00.000Z', createdBy: 'Cuenta ficticia',
});
const loan: Loan = {
  id: '00000000-0000-4000-8000-0000000000cc', number: '002/2026', loanedOn: '2026-08-31', dueOn: '2026-09-14', borrower: person, location: 'Sala ficticia',
  authorizerName: 'Autoriza Ficticio', authorizerUnit: 'Unidad ficticia', notes: 'Incluye cargador', returnedOn: null, returnNote: null, status: 'activo',
  items: [item(1, 'Notebook ficticio')], createdAt: '2026-08-31T12:00:00.000Z', createdBy: 'Cuenta ficticia',
};
// Texto tal como lo escribe pdf-lib con la fuente estándar (WinAnsi, en hexadecimal), sin depender de un extractor externo.
const shown = (text: string) => `<${Buffer.from(text, 'latin1').toString('hex').toUpperCase()}> Tj`;
const content = async (bytes: Uint8Array) => {
  const page = (await PDFDocument.load(bytes)).getPage(0);
  expect(page.getSize()).toEqual({ width: 612, height: 792 });
  const streams = page.node.Contents() as PDFArray;
  return Array.from({ length: streams.size() }, (_, index) => inflateSync((streams.lookup(index) as PDFRawStream).getContents()).toString('latin1')).join('\n');
};

describe('PDF de Bienes sobre los formularios oficiales', () => {
  it('llena el acta de entrega: folio, quien recibe, bienes en sus filas y la marca de borrador', async () => {
    const text = await content(await deliveryPdf(delivery([item(1), item(2)])));
    for (const value of ['008', 'PERSONA FICTICIA', '11.111.111-1', 'BIEN FICTICIO 2', 'SERIE1', 'Para uso docente', '17/11/2026', 'ENTREGA FICTICIO', 'Coordinación', 'BORRADOR']) expect(text).toContain(shown(value));
  });
  it('admite las ocho filas del acta y rechaza con un mensaje claro lo que no cabe', async () => {
    await expect(deliveryPdf(delivery(Array.from({ length: 8 }, (_, index) => item(index + 1))))).resolves.toBeInstanceOf(Uint8Array);
    await expect(deliveryPdf(delivery([item(1, 'Descripción larga '.repeat(20))]))).rejects.toMatchObject({ status: 422, code: 'DOCUMENT_TOO_LONG', message: expect.stringContaining('descripción del bien 1') });
  });
  it('llena el préstamo de un bien con su serie, la devolución esperada y quien autoriza', async () => {
    const text = await content(await loanPdf(loan));
    for (const value of ['002/2026', '31', '8', '26', 'Notebook ficticio SN: SERIE1', 'Sala ficticia', 'Persona Ficticia', 'Devolución esperada: 14/09/2026', 'Incluye cargador', 'Autoriza Ficticio', 'Unidad ficticia']) {
      expect(text).toContain(shown(value));
    }
  });
  it('llena el alta con los datos que piden las notas y el responsable que firma', async () => {
    const asset = {
      code: 'BN-0045', inventoryNumber: null, kind: 'equipo', description: 'Proyector ficticio', quantity: 1, location: 'Sala ficticia', registeredOn: '2026-08-17',
      brand: 'Marca', model: 'Modelo', serialNumber: 'S1', furnitureType: null, material: null, dimensions: null, area: null, systemPart: false, wallMounted: false, assembled: false,
      notes: null, custodian: person,
    } as unknown as AssetDetail;
    const text = await content(await altaPdf(asset));
    for (const value of ['17', '08', '2026', 'Proyector ficticio', 'Equipo: Proyector ficticio', 'Código Cenit: BN-0045', 'Parte de un sistema: No', 'Persona Ficticia', 'Docente']) expect(text).toContain(shown(value));
  });
  it('rechaza un carácter que la fuente del PDF no admite en vez de imprimir «?»', async () => {
    await expect(deliveryPdf(delivery([item(1)], 'Equipo revisado ✓'))).rejects.toMatchObject({ status: 422, message: expect.stringContaining('«✓»') });
    expect(unprintableChar('Año ñandú “comillas” – guion')).toBeUndefined();
    expect(unprintableChar('≥ 10')).toBe('≥');
  });
});
