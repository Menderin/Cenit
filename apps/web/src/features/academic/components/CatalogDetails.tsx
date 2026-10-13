import { useEffect, useRef } from 'react';
import { X, BookOpen } from '@phosphor-icons/react';
import type { AcademicCourse, AcademicPlan, Prerequisite } from '@cenit/contracts/academic';
import { semesterLabel } from '../model/group-by-semester.js';
import { progressLabels, type CourseProgress } from '../model/progress-presentation.js';
import type { Student } from './StudentLookup.js';

function Rule({ rule, plan }: { rule: Prerequisite; plan: AcademicPlan }) {
  if (rule.kind === 'pending') return <p className="academic-detail__explanation">Las relaciones están pendientes de interpretación; no confirman habilitación para cursar.</p>;
  if (rule.kind === 'unsupported') return <p className="academic-detail__explanation">{rule.description}</p>;
  if (rule.kind === 'none') return <p>Sin prerrequisitos.</p>;
  if (rule.kind === 'course') return <p>{plan.courses.find(c => c.code === rule.code)?.name ?? rule.code}</p>;
  return <><p>{rule.kind === 'allOf' ? 'Todos los siguientes:' : 'Al menos uno de los siguientes:'}</p><ul className="academic-rule">{rule.rules.map((child, index) => <li key={index}><Rule rule={child} plan={plan} /></li>)}</ul></>;
}

export function CatalogDetails({ course, plan, progress, student, onClose }: { course: AcademicCourse; plan: AcademicPlan; progress?: CourseProgress; student?: Student; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const incoming = plan.prerequisiteEdges.filter(edge => edge.toCode === course.code);
  const outgoing = plan.prerequisiteEdges.filter(edge => edge.fromCode === course.code);
  return <dialog ref={ref} className="academic-detail" aria-labelledby="academic-detail-title" onClose={onClose} onClick={event => {
    if (event.target === event.currentTarget) ref.current?.close();
  }}>
    <div className="academic-detail__surface">
      <header className="academic-detail__bar"><span><BookOpen size={16} weight="regular" aria-hidden="true" />Asignatura</span><button type="button" className="academic-icon-button" aria-label="Cerrar detalle" autoFocus onClick={() => ref.current?.close()}><X size={18} aria-hidden="true" /></button></header>
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
            {(course.prerequisites.kind === 'pending' || course.prerequisites.kind === 'unsupported') && <span className="academic-tag">{course.prerequisites.kind === 'pending' ? 'Interpretación pendiente' : 'Regla no soportada'}</span>}
            <Rule rule={course.prerequisites} plan={plan} />
            {(incoming.length + outgoing.length > 0) && <h4 className="academic-relations-title">Relaciones observadas</h4>}
            {[{ title: 'Hacia este ramo', edges: incoming, from: true }, { title: 'Desde este ramo', edges: outgoing, from: false }].map(group => group.edges.length > 0 && <div className="academic-relations" key={group.title}>
              <h4>{group.title}</h4><ul>{group.edges.map(edge => <li key={`${edge.fromCode}-${edge.toCode}`}>
                <span>{plan.courses.find(c => c.code === (group.from ? edge.fromCode : edge.toCode))?.name}</span>
                <small>{edge.interpretation === 'pending' ? 'En revisión' : 'Relación confirmada'}</small>
              </li>)}</ul>
            </div>)}
            {incoming.length + outgoing.length === 0 && <p className="academic-detail__explanation">Sin relaciones registradas. Esto no confirma la ausencia de prerrequisitos.</p>}
          </section>
          {progress && student && <details className="academic-detail__section academic-disclosure">
            <summary>Historial de intentos <span>{progress.attemptCount}</span></summary>
            <p className="academic-detail__explanation">{student.name} · {student.rut}</p>
            <dl className="academic-facts academic-history-facts"><div><dt>Última nota aprobatoria</dt><dd>{progress.passingGrade ?? 'Sin aprobación registrada'}</dd></div></dl>
            {progress.attempts.length === 0 ? <p className="academic-note">Sin intentos registrados para esta asignatura.</p> : <table className="academic-history-table"><caption className="academic-sr-only">Intentos de esta asignatura</caption><thead><tr><th scope="col">Intento</th><th scope="col">Estado</th><th scope="col">Nota</th></tr></thead><tbody>{progress.attempts.map(attempt => <tr key={attempt.attemptNumber}><td>{attempt.attemptNumber}</td><td>{progressLabels[attempt.status]}</td><td>{attempt.grade ?? 'Sin nota'}</td></tr>)}</tbody></table>}
          </details>}
          <details className="academic-detail__section academic-disclosure academic-plan-info">
            <summary>Información del plan</summary>
            <dl className="academic-facts"><div><dt>Plan</dt><dd>{plan.name}</dd></div><div><dt>Versión</dt><dd>{plan.version}</dd></div><div><dt>Código interno</dt><dd>{course.code}</dd></div>{course.officialCode && <div><dt>Código oficial</dt><dd>{course.officialCode}</dd></div>}</dl>
            {course.prerequisites.kind === 'pending' && <p className="academic-detail__explanation">{course.prerequisites.description}</p>}
          </details>
      </div>
    </div>
  </dialog>;
}
