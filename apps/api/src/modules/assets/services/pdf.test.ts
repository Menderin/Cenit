import { describe, expect, it } from 'vitest';
import type { Delivery, DocumentItem } from '@cenit/contracts/assets';
import { deliveryPdf, kindText, unprintableChar } from './pdf.js';

const item = (index: number, description = `Bien ficticio ${index}`): DocumentItem => ({
  assetId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, code: `BN-${String(index).padStart(4, '0')}`, quantity: 1, kind: 'equipo', description,
  brand: 'Marca', model: 'Modelo', serialNumber: `SERIE${index}`, material: null, dimensions: null,
});
const delivery = (items: DocumentItem[], reason = 'Para uso docente'): Delivery => ({
  id: '00000000-0000-4000-8000-0000000000aa', number: '001/2026', deliveredOn: '2026-11-17', reason, destination: null, giverName: 'Entrega Ficticio', giverPosition: null, giverUnit: null, notes: null,
  receiver: { id: '00000000-0000-4000-8000-0000000000bb', name: 'Persona Ficticia', rut: null, unit: 'Docencia', position: null, active: true, inactiveSince: null, assetCount: 0 },
  items, createdAt: '2026-11-17T12:00:00.000Z', createdBy: 'Cuenta ficticia',
});

describe('PDF de Bienes', () => {
  it('genera una entrega corta en una hoja', async () => {
    const bytes = await deliveryPdf(delivery([item(1), item(2)]));
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('rechaza con un mensaje claro lo que no cabe en una hoja carta', async () => {
    await expect(deliveryPdf(delivery(Array.from({ length: 12 }, (_, index) => item(index + 1, 'Descripción larga '.repeat(8)))))).rejects.toMatchObject({ status: 422, code: 'DOCUMENT_TOO_LONG' });
  });
  it('el préstamo indica el tipo de los bienes en «DATOS», sin repetir la lista del formulario', () => {
    expect(kindText([item(1), { ...item(2), kind: 'mueble' }, item(3)])).toBe('Equipo, Mueble');
    expect(kindText([{ ...item(1), kind: 'equipo_computacional' }])).toBe('Equipo computacional');
  });
  it('rechaza un carácter que la fuente del PDF no admite en vez de imprimir «?»', async () => {
    await expect(deliveryPdf(delivery([item(1)], 'Equipo revisado ✓'))).rejects.toMatchObject({ status: 422, message: expect.stringContaining('«✓»') });
    expect(unprintableChar('Año ñandú “comillas” – guion')).toBeUndefined();
    expect(unprintableChar('≥ 10')).toBe('≥');
  });
});
