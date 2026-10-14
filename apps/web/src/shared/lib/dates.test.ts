import { expect, it } from 'vitest';
import { calendarDate, calendarValue, dateValue, displayDate } from './dates.js';

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
