import { expect, it } from 'vitest';
import { compactRut, formatRutInput, isValidRut, isValidRutSearch } from './rut.js';

it('comprueba módulo 11, incluidos 0/K y cuerpos de siete u ocho cifras', () => {
  for (const rut of ['20.123.456-5', '21.123.456-3', '22.123.456-1', '20.000.008-0', '6.123.456-K', '20.000.003-K', '201234565', ' 20.000.003-k ']) expect(isValidRut(rut), rut).toBe(true);
  for (const rut of ['20.123.456-4', '00.000.001-K', '00000000-0', '20.123.456-X', '2', '2012345655']) expect(isValidRut(rut), rut).toBe(false);
});

it('acepta prefijos durante la búsqueda y rechaza completos incorrectos o comodines', () => {
  for (const rut of ['2', '20', '20.123', '20.123.456', '6.123.456-K', '201234565', '20.000.003-k']) expect(isValidRutSearch(rut), rut).toBe(true);
  for (const rut of ['20.123.456-4', '20.123.456-', '0', '%', '_', '.', '20-1', '12K', '20.123.456-X']) expect(isValidRutSearch(rut), rut).toBe(false);
  expect(compactRut(' 20.000.003-k ')).toBe('20000003K');
});

it('formatea escritura progresiva, pegado y borrado sin inventar el dígito', () => {
  expect(['2', '20', '201', '2012', '20123', '201234', '2012345', '20123456', '201234565'].map(formatRutInput)).toEqual(['2', '20', '201', '2.012', '20.123', '201.234', '2.012.345', '20.123.456', '20.123.456-5']);
  expect(formatRutInput('20.123.456-')).toBe('20.123.456');
  expect(formatRutInput('20000003k')).toBe('20.000.003-K');
  expect(formatRutInput('6123456-k')).toBe('6.123.456-K');
  expect(formatRutInput('20123456x')).toBe('20123456X');
});
