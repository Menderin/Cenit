import { describe, expect, it } from 'vitest';
import { recoveredExample } from './examples.js';
import { areaFrom, biFromText, documentTypeFrom, draftFromExtraction, formatRut, itemFromAccount, normalizeRut, recordDateFromFileName, rutCheckDigit, rutFromDescription, splitChargeAccount } from './suggestions.js';

describe('sugerencias para la fila del registro de gastos', () => {
  it('calcula, normaliza y da formato al RUT', () => {
    expect(rutCheckDigit('16482379')).toBe('2');
    expect(rutCheckDigit('77302815')).toBe('K');
    expect(normalizeRut(' 16.482.379-2 ')).toBe('16482379-2');
    expect(normalizeRut('77302815k')).toBe('77302815-K');
    expect(normalizeRut('sin rut')).toBe('sin rut');
    expect(formatRut('16482379-2')).toBe('16.482.379-2');
  });
  it('toma el RUT del final del detalle sólo si su verificador cuadra', () => {
    expect(rutFromDescription('SERVICIOS PROFESIONALES BOL/64, CAMILA ROJAS_164823792')).toBe('16482379-2');
    expect(rutFromDescription('ARRIENDO, ENERO_00000000 / ASEO, ENERO_135792640')).toBe('13579264-0');
    expect(rutFromDescription('ARRIENDO, ENERO 2026_00000000')).toBeNull();
    expect(rutFromDescription('… CAMILA ROJAS_164823793')).toBeNull();
    expect(rutFromDescription('… CAMILA ROJAS_16482379')).toBeNull();
    expect(rutFromDescription('NEWREST, ALMUERZO, COT. S/N')).toBeNull();
  });
  it('reconoce boletas de honorarios y el tipo de documento', () => {
    expect(biFromText('SERVICIOS PROFESIONALES BOL/50 DOCENCIAS')).toBe('50');
    expect(biFromText('sin boleta', '08122025 SI125444 COQ HEE BHE_BH31_1961')).toBe('31');
    expect(biFromText('07012026 SI127431_COQ HEE BH75_2132')).toBe('75');
    expect(biFromText('COFFEE, COT. 07012025', null)).toBeNull();
    expect(documentTypeFrom('SERVICIOS PROFESIONALES BOL/50', null)).toBe('HONORARIOS');
    expect(documentTypeFrom('ARRIENDO CASA', '07012026 SI1_COQ HEE BH75')).toBe('HONORARIOS');
    expect(documentTypeFrom('PASAJES AÉREOS, COT. S/N', null)).toBe('COTIZACIÓN');
  });
  it('propone UNIDAD por el departamento del detalle e ITEM por la cuenta', () => {
    expect(areaFrom('TUTORÍAS PREGRADO, DEPTO CLINICAS, ENERO')).toBe('CLINICA');
    expect(areaFrom('INSUMOS, DEPTO CIENCIAS BIOMÉDICAS, COT. 1')).toBe('CIENCIAS BIOMEDICAS');
    expect(areaFrom('HONORARIOS, BOL/27, DEPTO SALUD PUBLICA_76455102')).toBe('SALUD PUBLICA');
    expect(areaFrom('CEREMONIA, CARRERA DE KINESIOLOGÍA')).toBe('FAMED');
    expect(itemFromAccount('420405')).toBe('ALIMENTACIÓN');
    expect(itemFromAccount('999999')).toBeNull();
  });
  it('separa la cuenta de cargo y lee la fecha del nombre de la captura', () => {
    expect(splitChargeAccount('01.02.270101.00000000.410103')).toEqual({ universityCode: '01', campusCode: '02', unitCode: '270101', projectCode: '00000000', accountingCode: '410103' });
    expect(splitChargeAccount('01.02.270101')).toBeNull();
    expect(recordDateFromFileName('Captura de pantalla 2026-01-09 a la(s) 12.25.32 p.m..png')).toBe('2026-01-09');
    expect(recordDateFromFileName('Captura de pantalla 2026-01-09 122532.png')).toBe('2026-01-09');
    expect(recordDateFromFileName('Screenshot 2026-02-30 at 10.00.png')).toBeNull();
    expect(recordDateFromFileName('solicitud.png')).toBeNull();
  });
  it('arma la fila desde una captura marcando lo leído y lo sugerido', () => {
    const { draft, sources, dateSource } = draftFromExtraction(recoveredExample, {
      name: 'Captura de pantalla 2026-10-13 a la(s) 10.00.00.png', lastModified: new Date(2026, 9, 20, 15).getTime(),
    });
    expect(dateSource).toBe('filename');
    expect(draft.record).toMatchObject({ recordDate: '2026-10-13', requestNumber: '000125', provider: 'Proveedor Ficticio A', description: 'Insumos de demostración',
      totalAmount: '200000', unitCode: '270101', projectCode: '00000000', accountingCode: '420405', documentType: 'COTIZACIÓN', bi: 'S/N', area: 'FAMED',
      item: 'ALIMENTACIÓN', rut: null, document: 'SISTEMA DE COMPRAS', paymentSituation: 'PENDIENTE' });
    expect(sources).toMatchObject({ requestNumber: 'read', provider: 'read', unitCode: 'read', recordDate: 'suggested', item: 'suggested' });
    expect(sources.rut).toBeUndefined();
    expect(draft.oracle).toMatchObject({ sentDate: '2026-10-12', oracleId: 'demo-000325', taxAmount: '0' });
    expect(draft.lines).toHaveLength(2);
    const dated = draftFromExtraction(recoveredExample, { name: 'solicitud.png', lastModified: new Date(2026, 9, 20, 15).getTime() });
    expect(dated.draft.record.recordDate).toBe('2026-10-20');
    expect(dated.dateSource).toBe('modified');
    const undated = draftFromExtraction(recoveredExample, { name: 'solicitud.png' }, new Date(2026, 9, 22));
    expect(undated.draft.record.recordDate).toBe('2026-10-22');
    expect(undated.dateSource).toBe('today');
  });
});
