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
