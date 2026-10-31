// Calendar dates have no time zone. Never parse YYYY-MM-DD as a UTC timestamp.
export function displayDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
}
export function dateValue(text: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(text) ? text.split('/').reverse().join('-') : text;
}
export function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}
export function calendarValue(date: Date) {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
// Instants (createdAt, reviewedAt...) are shown in Santiago time as dd/MM/aaaa, never in the browser's time zone.
const instantFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function instantParts(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : Object.fromEntries(instantFormat.formatToParts(time).map(part => [part.type, part.value])) as Record<'day' | 'month' | 'year' | 'hour' | 'minute', string>;
}
export function displayInstantDate(value: string) {
  const parts = instantParts(value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : value;
}
export function displayDateTime(value: string) {
  const parts = instantParts(value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}` : value;
}
