import { useEffect, useRef, useState } from 'react';
import { ArrowDownRightIcon } from '@phosphor-icons/react/dist/csr/ArrowDownRight';
import { ArrowUpLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowUpLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { HourglassIcon } from '@phosphor-icons/react/dist/csr/Hourglass';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { AcademicCourse, AcademicPlan, Prerequisite } from '@cenit/contracts/academic';
import { semesterLabel } from '../model/group-by-semester.js';
import { progressLabels, type CourseProgress } from '../model/progress-presentation.js';
import type { Student } from './StudentLookup.js';
import { courseRelations } from '../model/course-relations.js';
import { displayDate } from '../../../shared/lib/dates.js';

const sourceStatusLabels = {
  example: 'Fuente de demostración.',
  teamReviewed: 'Revisada por el equipo. Validación institucional pendiente.',
  clientValidated: 'Validada institucionalmente.',
};
const sct = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
type Statuses = Map<string, CourseProgress>;

function Status({ record }: { record?: CourseProgress }) {
  return record ? <span className={`academic-detail-status academic-detail-status--${record.status}`}>{progressLabels[record.status]}</span> : null;
}
function CourseLine({ code, plan, statuses, note }: { code: string; plan: AcademicPlan; statuses: Statuses; note?: string }) {
  return <><span className="academic-detail-course"><span>{plan.courses.find(course => course.code === code)?.name ?? code}</span>{note && <small>{note}</small>}</span><Status record={statuses.get(code)} /></>;
}
function Rule({ rule, plan, statuses }: { rule: Prerequisite; plan: AcademicPlan; statuses: Statuses }) {
  // Pending rules stay pending: the panel says so plainly and never reads arrows as requirements.
  if (rule.kind === 'pending') return <div className="academic-detail-callout"><HourglassIcon size={18} aria-hidden="true" /><div><p>Pendientes de confirmación.</p><p className="academic-detail__explanation">{rule.description}</p></div></div>;
  if (rule.kind === 'unsupported') return <div className="academic-detail-callout"><HourglassIcon size={18} aria-hidden="true" /><div><p>Regla no soportada.</p><p className="academic-detail__explanation">{rule.description}</p><p className="academic-detail__explanation">Esta condición no puede representarse con las reglas disponibles. No se interpreta como ausencia de prerrequisitos.</p></div></div>;
  if (rule.kind === 'none') return <p>Sin prerrequisitos. Ausencia confirmada en el plan.</p>;
  if (rule.kind === 'course') return <p>{plan.courses.find(c => c.code === rule.code)?.name ?? rule.code}</p>;
  return <><p>{rule.kind === 'allOf' ? 'Todos los siguientes:' : 'Al menos uno de los siguientes:'}</p><ul className="academic-rule">{rule.rules.map((child, index) => <li key={index}>{child.kind === 'course' ? <CourseLine code={child.code} plan={plan} statuses={statuses} /> : <Rule rule={child} plan={plan} statuses={statuses} />}</li>)}</ul></>;
}

export function CatalogDetails({ course, plan, progress, student, statuses = new Map(), onClose }: {
  course: AcademicCourse; plan: AcademicPlan; progress?: CourseProgress; student?: Student; statuses?: Statuses; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  // Open on the side away from the chosen course so it and its highlighted relations stay in view.
  const [side] = useState(() => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement.getBoundingClientRect() : null;
    return origin && origin.left + origin.width / 2 > window.innerWidth / 2 ? 'left' : 'right';
  });
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => ref.current?.close(), 150);
    return () => clearTimeout(timer);
  }, [closing]);
  const incoming = plan.prerequisiteEdges.filter(edge => edge.toCode === course.code);
  const outgoing = plan.prerequisiteEdges.filter(edge => edge.fromCode === course.code);
  const indirect = [...courseRelations(plan, course.code)].filter(([, relation]) => relation.depth > 1);
  const pending = course.prerequisites.kind === 'pending';
  const range = semesterLabel(course.semester, course.semesterEnd);
  const lastGrade = progress?.attempts.at(-1)?.grade ?? null;
  return <dialog ref={ref} className={`academic-detail academic-detail--${side}${closing ? ' academic-detail--closing' : ''}`} aria-labelledby="academic-detail-title" onClose={onClose}
    onCancel={event => { event.preventDefault(); setClosing(true); }} onTransitionEnd={event => { if (closing && event.target === event.currentTarget && event.propertyName === 'opacity') ref.current?.close(); }} onClick={event => {
    if (event.target === event.currentTarget) setClosing(true);
  }}>
    <div className="academic-detail__surface">
      <header className="academic-detail__header">
        <div><p className="academic-detail__eyebrow">{range} · {course.credits === null ? 'SCT no informados' : `${sct.format(course.credits)} SCT`}</p>
          <h2 id="academic-detail-title">{course.name}</h2>
          {progress && <p className="academic-detail__state"><Status record={progress} />{lastGrade && <span>Nota {lastGrade}</span>}</p>}</div>
        <button type="button" className="cenit-button cenit-button--icon" aria-label="Cerrar detalle" autoFocus onClick={() => setClosing(true)}><XIcon size={18} aria-hidden="true" /></button>
      </header>
      <div className="academic-detail__body">
          {course.semester !== course.semesterEnd && <p className="academic-note">Rotaciones del intervalo {range.replace('Semestres ', '')}, sin un orden asignado entre ellas.</p>}
          {progress && student && <section className="academic-detail__section academic-detail__progress" aria-labelledby="academic-history-title">
            <h3 id="academic-history-title">Historial de intentos <span className="academic-detail__count">{progress.attemptCount}</span></h3>
            {progress.attempts.length === 0 ? <p className="academic-detail__explanation">Sin intentos registrados para esta asignatura.</p> : <><dl className="academic-facts"><div><dt>Estado actual</dt><dd>{progressLabels[progress.status]}</dd></div><div><dt>Última nota</dt><dd>{lastGrade ?? 'Sin nota'}</dd></div><div><dt>Nota aprobatoria</dt><dd>{progress.passingGrade ?? 'Sin aprobación'}</dd></div></dl>
            <table className="academic-history-table"><caption className="academic-sr-only">Intentos de {student.name} en esta asignatura</caption><thead><tr><th scope="col">Intento</th><th scope="col">Estado</th><th scope="col">Nota</th></tr></thead><tbody>{progress.attempts.map(attempt => <tr key={attempt.attemptNumber}><td>{attempt.attemptNumber}</td><td>{progressLabels[attempt.status]}</td><td>{attempt.grade ?? 'Sin nota'}</td></tr>)}</tbody></table></>}
          </section>}
          <section className="academic-detail__section" aria-labelledby="academic-rule-title">
            <h3 id="academic-rule-title">Prerrequisitos</h3>
            <Rule rule={course.prerequisites} plan={plan} statuses={statuses} />
            {pending && incoming.length + outgoing.length === 0 && <p className="academic-detail__explanation">Todavía no hay información de prerrequisitos para esta asignatura.</p>}
          </section>
          {(incoming.length + outgoing.length + indirect.length > 0) && <section className="academic-detail__section" aria-labelledby="academic-map-title">
            <h3 id="academic-map-title">En la malla</h3>
            <p className="academic-detail__explanation academic-detail__lead">Conexiones dibujadas en la malla de referencia. Orientan el recorrido, pero no son requisitos de inscripción.</p>
            {[{ title: 'Viene de', icon: ArrowUpLeftIcon, codes: incoming.map(edge => edge.fromCode) }, { title: 'Abre camino a', icon: ArrowDownRightIcon, codes: outgoing.map(edge => edge.toCode) }].map(group => group.codes.length > 0 && <div className="academic-relations" key={group.title}>
              <h4><group.icon size={14} aria-hidden="true" />{group.title}</h4><ul>{group.codes.map(code => <li key={code}><CourseLine code={code} plan={plan} statuses={statuses} /></li>)}</ul>
            </div>)}
            {indirect.length > 0 && <details className="academic-relations academic-disclosure"><summary><CaretRightIcon className="academic-disclosure__caret" size={12} aria-hidden="true" />Más adelante en la cadena <span>{indirect.length}</span></summary><ul>{indirect.map(([code, relation]) => <li key={code}>
              <CourseLine code={code} plan={plan} statuses={statuses} note={`A través de ${plan.courses.find(item => item.code === relation.via)?.name}`} />
            </li>)}</ul></details>}
          </section>}
          <details className="academic-detail__section academic-disclosure academic-plan-info">
            <summary><CaretRightIcon className="academic-disclosure__caret" size={12} aria-hidden="true" />Información del plan</summary>
            <dl className="academic-facts"><div><dt>Plan</dt><dd>{plan.name}</dd></div><div><dt>Código interno</dt><dd>{course.code}</dd></div>{course.officialCode && <div><dt>Código oficial</dt><dd>{course.officialCode}</dd></div>}</dl>
            <dl className="academic-facts academic-plan-sources" aria-label="Fuentes del catálogo">{plan.sources.map(source => <div key={source.sourceId}>
              <dt>{source.title}</dt><dd>{sourceStatusLabels[source.validationStatus]}</dd>
              {source.reviewedAt && <dd>Revisada el <time dateTime={source.reviewedAt}>{displayDate(source.reviewedAt)}</time></dd>}
            </div>)}</dl>
          </details>
      </div>
    </div>
  </dialog>;
}
