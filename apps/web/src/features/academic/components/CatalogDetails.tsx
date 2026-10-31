import { useEffect, useRef, useState } from 'react';
import { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
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

function Rule({ rule, plan }: { rule: Prerequisite; plan: AcademicPlan }) {
  if (rule.kind === 'pending') return <><p>Pendientes de confirmación.</p><p className="academic-detail__explanation">{rule.description}</p></>;
  if (rule.kind === 'unsupported') return <><p>Regla no soportada.</p><p className="academic-detail__explanation">{rule.description}</p><p className="academic-detail__explanation">Esta condición no puede representarse con las reglas disponibles. No se interpreta como ausencia de prerrequisitos.</p></>;
  if (rule.kind === 'none') return <p>Sin prerrequisitos. Ausencia confirmada en esta versión del plan.</p>;
  if (rule.kind === 'course') return <p>{plan.courses.find(c => c.code === rule.code)?.name ?? rule.code}</p>;
  return <><p>{rule.kind === 'allOf' ? 'Todos los siguientes:' : 'Al menos uno de los siguientes:'}</p><ul className="academic-rule">{rule.rules.map((child, index) => <li key={index}><Rule rule={child} plan={plan} /></li>)}</ul></>;
}

export function CatalogDetails({ course, plan, progress, student, onClose }: { course: AcademicCourse; plan: AcademicPlan; progress?: CourseProgress; student?: Student; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
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
  return <dialog ref={ref} className={`academic-detail${closing ? ' academic-detail--closing' : ''}`} aria-labelledby="academic-detail-title" onClose={onClose}
    onCancel={event => { event.preventDefault(); setClosing(true); }} onTransitionEnd={event => { if (closing && event.target === event.currentTarget && event.propertyName === 'opacity') ref.current?.close(); }} onClick={event => {
    if (event.target === event.currentTarget) setClosing(true);
  }}>
    <div className="academic-detail__surface">
      <header className="academic-detail__bar"><span><BookOpenIcon size={16} weight="regular" aria-hidden="true" />Asignatura</span><button type="button" className="cenit-button cenit-button--icon" aria-label="Cerrar detalle" autoFocus onClick={() => setClosing(true)}><XIcon size={18} aria-hidden="true" /></button></header>
      <div className="academic-detail__body">
        <h2 id="academic-detail-title">{course.name}</h2>
          <dl className="academic-facts">
            <div><dt>Semestre</dt><dd>{semesterLabel(course.semester, course.semesterEnd).replace(/^Semestres? /, '')}</dd></div>
            <div><dt>Créditos SCT</dt><dd>{course.credits ?? 'No informados'}</dd></div>
            {progress && <><div><dt>Estado actual</dt><dd>{progressLabels[progress.status]}</dd></div><div><dt>Última nota</dt><dd>{progress.attempts.at(-1)?.grade ?? 'Sin nota'}</dd></div></>}
          </dl>
          {course.semester !== course.semesterEnd && <p className="academic-note">Rotaciones del intervalo {semesterLabel(course.semester, course.semesterEnd).replace('Semestres ', '')}, sin un orden asignado entre ellas.</p>}
          <section className="academic-detail__section" aria-labelledby="academic-rule-title">
            <h3 id="academic-rule-title">Prerrequisitos</h3>
            <Rule rule={course.prerequisites} plan={plan} />
            {(incoming.length + outgoing.length > 0) && <><h4 className="academic-relations-title">Relaciones entre asignaturas</h4><p className="academic-detail__explanation">Relaciones de la malla de referencia. No indican por sí solas los requisitos para inscribir la asignatura.</p></>}
            {[{ title: 'Hacia esta asignatura', edges: incoming, from: true }, { title: 'Desde esta asignatura', edges: outgoing, from: false }].map(group => group.edges.length > 0 && <div className="academic-relations" key={group.title}>
              <h4>{group.title}</h4><ul>{group.edges.map(edge => <li key={`${edge.fromCode}-${edge.toCode}`}>
                <span>{plan.courses.find(c => c.code === (group.from ? edge.fromCode : edge.toCode))?.name}</span>
              </li>)}</ul>
            </div>)}
            {indirect.length > 0 && <details className="academic-relations academic-disclosure"><summary><CaretRightIcon className="academic-disclosure__caret" size={12} aria-hidden="true" />Más adelante en la cadena <span>{indirect.length}</span></summary><ul>{indirect.map(([code, relation]) => <li key={code}>
              <span>{plan.courses.find(item => item.code === code)?.name}</span><span className="academic-relations__via">A través de {plan.courses.find(item => item.code === relation.via)?.name}</span>
            </li>)}</ul></details>}
            {pending && incoming.length + outgoing.length === 0 && <p className="academic-detail__explanation">Todavía no hay información de prerrequisitos para esta asignatura.</p>}
          </section>
          {progress && student && <details className="academic-detail__section academic-disclosure">
            <summary><CaretRightIcon className="academic-disclosure__caret" size={12} aria-hidden="true" />Historial de intentos <span>{progress.attemptCount}</span></summary>
            <p className="academic-detail__explanation">{student.name} · {student.rut}</p>
            <dl className="academic-facts academic-history-facts"><div><dt>Última nota aprobatoria</dt><dd>{progress.passingGrade ?? 'Sin aprobación registrada'}</dd></div></dl>
            {progress.attempts.length === 0 ? <p className="academic-note">Sin intentos registrados para esta asignatura.</p> : <table className="academic-history-table"><caption className="academic-sr-only">Intentos de esta asignatura</caption><thead><tr><th scope="col">Intento</th><th scope="col">Estado</th><th scope="col">Nota</th></tr></thead><tbody>{progress.attempts.map(attempt => <tr key={attempt.attemptNumber}><td>{attempt.attemptNumber}</td><td>{progressLabels[attempt.status]}</td><td>{attempt.grade ?? 'Sin nota'}</td></tr>)}</tbody></table>}
          </details>}
          <details className="academic-detail__section academic-disclosure academic-plan-info">
            <summary><CaretRightIcon className="academic-disclosure__caret" size={12} aria-hidden="true" />Información del plan</summary>
            <dl className="academic-facts"><div><dt>Plan</dt><dd>{plan.name}</dd></div><div><dt>Versión</dt><dd>{plan.version}</dd></div><div><dt>Código interno</dt><dd>{course.code}</dd></div>{course.officialCode && <div><dt>Código oficial</dt><dd>{course.officialCode}</dd></div>}</dl>
            <dl className="academic-facts academic-plan-sources" aria-label="Fuentes del catálogo">{plan.sources.map(source => <div key={source.sourceId}>
              <dt>{source.title}</dt><dd>{sourceStatusLabels[source.validationStatus]}</dd>
              {source.reviewedAt && <dd>Revisada el <time dateTime={source.reviewedAt}>{displayDate(source.reviewedAt)}</time></dd>}
            </div>)}</dl>
          </details>
      </div>
    </div>
  </dialog>;
}
