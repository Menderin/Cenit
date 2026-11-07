import type { AcademicPlan, ProgressResponse } from '@cenit/contracts/academic';
import { progressLabels } from '../model/progress-presentation.js';

const order = ['passed', 'inProgress', 'failed', 'notTaken'] as const;
const credits = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

/**
 * Counts what the record already says; it does not infer prerequisites or project progress.
 * SCT are shown only when every course in the plan has credits, so the bar never rests on guesses.
 */
export function StudentProgressSummary({ plan, progress }: { plan: AcademicPlan; progress: ProgressResponse['data'] }) {
  const status = new Map(progress.courses.map(course => [course.code, course.status]));
  const counts = Object.fromEntries(order.map(key => [key, plan.courses.filter(course => (status.get(course.code) ?? 'notTaken') === key).length])) as Record<typeof order[number], number>;
  const known = plan.courses.every(course => course.credits !== null);
  const sum = (key: string) => plan.courses.reduce((total, course) => total + ((status.get(course.code) ?? 'notTaken') === key ? course.credits ?? 0 : 0), 0);
  const total = plan.courses.reduce((all, course) => all + (course.credits ?? 0), 0), passed = sum('passed'), ongoing = sum('inProgress');
  const initials = progress.student.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-CL');
  return <section className="academic-student-summary" aria-label={`Avance de ${progress.student.name}`}>
    <div className="academic-student-summary__person"><span aria-hidden="true">{initials}</span><div><strong>{progress.student.name}</strong><small>RUT {progress.student.rut}</small></div></div>
    <div className="academic-student-summary__credits">
      {known && total > 0 && <><p><span>Créditos SCT aprobados</span><span><strong>{credits.format(passed)}</strong> de {credits.format(total)}</span></p>
      <div className="academic-student-summary__bar" role="img" aria-label={`${credits.format(passed)} de ${credits.format(total)} créditos aprobados; ${credits.format(ongoing)} en curso`}><i data-status="passed" style={{ width: `${passed / total * 100}%` }} /><i data-status="inProgress" style={{ width: `${ongoing / total * 100}%` }} /></div></>}
      {/* Each count carries the status color, so it doubles as the legend for the board. */}
      <ul className="academic-student-summary__counts" aria-label="Asignaturas por estado">{order.map(key => <li key={key} data-status={key}><span className={`academic-progress-dot academic-progress-dot--${key}`} aria-hidden="true" /><strong>{counts[key]}</strong>{progressLabels[key].toLocaleLowerCase('es-CL').replace(/a$/, counts[key] === 1 ? 'a' : 'as')}</li>)}</ul>
    </div>
  </section>;
}
