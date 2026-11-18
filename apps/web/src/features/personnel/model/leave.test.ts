import { describe, expect, it } from 'vitest';
import { emptyLeave, leaveDateParts, leaveFileName, leaveInput, validRut, validateLeaveStep } from './leave.js';

describe('validación provisional de la solicitud de permiso', () => {
  it('exige funcionario, RUT válido, unidad y fecha de solicitud', () => {
    const draft = { ...emptyLeave(), requestDate: '' };
    expect(Object.keys(validateLeaveStep(draft, 'funcionario'))).toEqual(['name', 'rut', 'unit', 'requestDate']);
    const filled = { ...draft, name: 'Camila Ejemplo', rut: '15.482.903-1', unit: 'Facultad ficticia', requestDate: '2026-11-13' };
    expect(validateLeaveStep(filled, 'funcionario')).toEqual({ rut: 'Revisa el RUT; el dígito verificador no coincide.' });
    expect(validateLeaveStep({ ...filled, rut: '15482903-2' }, 'funcionario')).toEqual({});
  });

  it('valida el dígito verificador, incluido K y 0', () => {
    expect(validRut('16.051.938-K')).toBe(true);
    expect(validRut('16051938k')).toBe(true);
    expect(validRut('18.456.721-0')).toBe(true);
    expect(validRut('18.456.721-1')).toBe(false);
    expect(validRut('abc')).toBe(false);
  });

  it('pide horario y recuperación sólo en el permiso por hora', () => {
    const draft = { ...emptyLeave(), type: 'dia_administrativo' as const, from: '2026-11-20', to: '2026-11-20' };
    expect(validateLeaveStep(draft, 'permiso')).toEqual({});
    expect(Object.keys(validateLeaveStep({ ...draft, type: 'por_hora' }, 'permiso'))).toEqual(['hours', 'minutes', 'startTime', 'endTime', 'recoveryDate']);
    const hourly = { ...draft, type: 'por_hora' as const, hours: '2', minutes: '30', startTime: '10:00', endTime: '09:30', recoveryDate: '2026-11-27' };
    expect(validateLeaveStep(hourly, 'permiso')).toEqual({ endTime: 'Debe ser posterior a la hora de inicio.' });
    expect(validateLeaveStep({ ...hourly, endTime: '12:30', minutes: '75' }, 'permiso')).toEqual({ minutes: 'Ingresa minutos entre 0 y 59.' });
  });

  it('detecta fechas invertidas y deja el total de días opcional', () => {
    const draft = { ...emptyLeave(), type: 'matrimonio' as const, from: '2026-11-20', to: '2026-11-19' };
    expect(validateLeaveStep(draft, 'permiso')).toEqual({ to: 'Debe ser igual o posterior al inicio.' });
    expect(validateLeaveStep({ ...draft, to: '2026-11-25', totalDays: 'cinco' }, 'permiso')).toEqual({ totalDays: 'Usa un número; para medio día escribe ½ o 0,5.' });
  });
});

describe('datos enviados e impresos de la solicitud', () => {
  it('no envía el horario cuando el permiso no es por hora', () => {
    const draft = { ...emptyLeave(), type: 'teletrabajo' as const, hours: '1', startTime: '09:00', recoveryDate: '2026-11-30' };
    expect(leaveInput(draft)).toMatchObject({ hours: '', startTime: '', recoveryDate: '' });
    expect(leaveInput({ ...draft, type: 'por_hora' })).toMatchObject({ hours: '1', startTime: '09:00' });
  });

  it('separa las fechas en casillas y nombra el archivo sin tildes', () => {
    expect(leaveDateParts('2026-06-05')).toEqual(['5', '6', '2026']);
    expect(leaveDateParts('2026-06-05', true)).toEqual(['5', '6', '26']);
    expect(leaveDateParts('')).toEqual(['', '', '']);
    expect(leaveFileName({ ...emptyLeave(), name: 'Tomás Vera Rojas', from: '2026-11-20' })).toBe('solicitud-permiso-vera-rojas-2026-11-20');
  });
});
