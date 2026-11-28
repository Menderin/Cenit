import { describe, expect, it } from 'vitest';
import { suggestDescriptionFormat as suggest } from './description-format.js';

describe('propuesta de formato de descripción OCR', () => {
  it('conserva proveedor coincidente, referencias, siglas, acentos y sufijos', () => {
    expect(suggest('SERVICIOS BOL/31, 44 HRS. APS, SEPTIEMBRE, ANA PÉREZ_00000000', ['ANA PÉREZ']))
      .toBe('Servicios BOL/31, 44 HRS. APS, septiembre, ANA PÉREZ_00000000');
  });
  it('protege frases del proveedor sin asumir que una coma o un mes delimitan nombres', () => {
    expect(suggest('SERVICIO PARA EQUIPO DEL SUR, SEPTIEMBRE Y OCTUBRE', ['EQUIPO DEL SUR']))
      .toBe('Servicio para EQUIPO DEL SUR, septiembre y octubre');
  });
  it('capitaliza el nombre abreviado de un proveedor junto a un RUT válido', () => {
    const providers = ['LUCÍA ELENA MUÑOZ CID'];
    const normalized = suggest('ASESORÍA, LUCÍA MUÑOZ_123456785', providers);
    expect(normalized).toBe('Asesoría, Lucía Muñoz_123456785');
    expect(suggest(normalized, providers)).toBe(normalized);
    expect(suggest('ASESORÍA, LUCÍA MUÑOZ_123456780', providers)).toBe('Asesoría, lucía MUÑOZ_123456780');
    expect(suggest('ASESORÍA, LUCÍA PÉREZ_123456785', providers)).toBe('Asesoría, lucía PÉREZ_123456785');
  });
  it('capitaliza nombres completos y respeta las partículas de los apellidos', () => {
    expect(suggest('ASESORÍA, lucía DE LA CRUZ_123456785', ['LUCÍA DE LA CRUZ']))
      .toBe('Asesoría, Lucía de la Cruz_123456785');
  });
  it('conserva el nombre comercial que coincide con una razón social', () => {
    expect(suggest('COMPRA, EQUIPO DEL SUR_123456785', ['EQUIPO DEL SUR SPA']))
      .toBe('Compra, EQUIPO DEL SUR_123456785');
  });
  it('no trata proveedores como expresiones regulares ni coincidencias parciales', () => {
    expect(suggest('SERVICIO PARA A+B Y ANABEL', ['A+B', 'ANA'])).toBe('Servicio para A+B y anabel');
  });
  it('conserva enlaces, correos, cifras e identificadores', () => {
    expect(suggest('VER https://EXAMPLE.test/ArchivoABC A.B@EXAMPLE.test ID AB-001 1.500'))
      .toBe('Ver https://EXAMPLE.test/ArchivoABC A.B@EXAMPLE.test ID AB-001 1.500');
  });
  it('no inventa tildes ni corrige nombres desconocidos y es repetible', () => {
    const text = suggest('SERVICIOS DE FUTBOL, NOMBRE DESCONOCIDO');
    expect(text).toBe('Servicios de futbol, nombre desconocido');
    expect(suggest(text)).toBe(text);
    expect(suggest('')).toBe('');
  });
  it('no modifica un correo, código o proveedor cuando inicia la descripción', () => {
    expect(suggest('ana@EXAMPLE.test SERVICIOS')).toBe('ana@EXAMPLE.test servicios');
    expect(suggest('abc-001 SERVICIOS')).toBe('abc-001 servicios');
    expect(suggest('ana Pérez SERVICIOS', ['ana Pérez'])).toBe('ana Pérez servicios');
  });
});
