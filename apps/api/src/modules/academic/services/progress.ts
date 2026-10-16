import type { Attempt, ProgressResponse, AcademicCourse } from '@cenit/contracts/academic';

export function formatAcademicGrade(value: string | null): string | null {
  if (value === null) return null;
  const match = /^([1-7])(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new Error('Nota fuera del formato numérico permitido.');
  const fraction = match[2] ?? '';
  // Hide trailing zeros, never round an unconfirmed second significant decimal.
  if (/[1-9]/.test(fraction.slice(1)) || (match[1] === '7' && /[1-9]/.test(fraction))) throw new Error('Nota fuera de rango o con más de un decimal.');
  return match[1]! + (fraction[0] && fraction[0] !== '0' ? `,${fraction[0]}` : '');
}

export function courseProgress(code: string, attempts: Attempt[]): ProgressResponse['data']['courses'][number] {
  const ordered = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const last = ordered.at(-1);
  // Demo fixtures end at approval; this is presentation of stored attempts, not a rule of eligibility.
  const approved = ordered.filter(a => a.status === 'passed').at(-1);
  return { code, status: last?.status ?? 'notTaken', attemptCount: ordered.length, passingGrade: approved?.grade ?? null, attempts: ordered };
}
export function buildProgress(courses: Pick<AcademicCourse, 'code'>[], attempts: { code: string; attempt: Attempt }[]) {
  const byCode = new Map<string, Attempt[]>();
  for (const { code, attempt } of attempts) {
    const rows = byCode.get(code) ?? []; rows.push(attempt); byCode.set(code, rows);
  }
  return courses.map(course => courseProgress(course.code, byCode.get(course.code) ?? []));
}
export function normalizeRutSearch(value: string): string {
  return value.replaceAll('.', '').toUpperCase();
}
