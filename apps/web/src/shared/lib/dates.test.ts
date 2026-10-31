import { expect, it } from 'vitest';
import { calendarDate, calendarValue, dateValue, displayDate, displayDateTime, displayInstantDate } from './dates.js';

it('dates keep their calendar day, including leap years and early years, in different time zones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/Santiago', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = zone;
      for (const value of ['2026-10-14', '2028-02-29', '0099-01-02']) {
        expect(calendarValue(calendarDate(value)!)).toBe(value);
        expect(dateValue(displayDate(value))).toBe(value);
      }
      for (const invalid of ['2027-02-29', '2026-04-31', '2026-13-01', '14/10/2026', '']) expect(calendarDate(invalid)).toBeUndefined();
    }
    expect(dateValue('31/02/2026')).toBe('2026-02-31'); // Preserve invalid input for the shared contract's error.
    expect(dateValue('14/10/')).toBe('14/10/');
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

it('instants are shown as dd/MM/aaaa in Santiago time, whatever the browser time zone', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/Santiago', 'Pacific/Honolulu', 'UTC']) {
      process.env.TZ = zone;
      expect(displayDateTime('2026-09-28T18:11:00Z')).toBe('28/09/2026, 15:11');
      expect(displayDateTime('2026-07-01T00:30:00.000Z')).toBe('30/06/2026, 20:30'); // Midnight UTC is still the previous day in Santiago.
      expect(displayDateTime('2026-01-01T02:59:00Z')).toBe('31/12/2025, 23:59');
      expect(displayDateTime('2026-10-14T03:00:00Z')).toBe('14/10/2026, 00:00');
      expect(displayInstantDate('2026-07-01T00:30:00Z')).toBe('30/06/2026');
    }
    expect(displayDateTime('sin fecha')).toBe('sin fecha');
    expect(displayInstantDate('')).toBe('');
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});
