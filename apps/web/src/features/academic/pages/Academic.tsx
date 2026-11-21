import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useSearchParams } from 'react-router';
import { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { GraduationCapIcon } from '@phosphor-icons/react/dist/csr/GraduationCap';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import type { AcademicCourse, AcademicPlan } from '@cenit/contracts/academic';
import { useAuth } from '../../auth/model/session.js';
import { SessionWarning } from '../../auth/components/SessionWarning.js';
import { AccountProfileLink } from '../../auth/components/AccountProfileLink.js';
import { HttpError } from '../../../shared/lib/http.js';
import { getPlans, getPlan, getProgress, retryAcademicRead } from '../api/academic.js';
import { groupBySemester, semesterLabel } from '../model/group-by-semester.js';
import { courseLabel } from '../model/course-label.js';
import { CatalogDetails } from '../components/CatalogDetails.js';
import { StudentLookup, type Student } from '../components/StudentLookup.js';
import { StudentProgressSummary } from '../components/StudentProgressSummary.js';
import { progressLabels } from '../model/progress-presentation.js';
import { courseRelations } from '../model/course-relations.js';
import { useSidebar } from '../../../shared/lib/use-sidebar.js';
import { WorkspaceShell } from '../../../shared/components/WorkspaceShell.js';
import { LoadingLabel, Skeleton } from '../../../shared/components/Skeleton.js';
import '../academic.css';

// Estado de la fuente principal del catálogo; una malla validada institucionalmente no necesita etiqueta.
const catalogStatusLabels = { example: 'Catálogo de ejemplo', teamReviewed: 'Validación institucional pendiente', clientValidated: null } as const;

function BoardSkeleton() {
  return <>
    <LoadingLabel>Cargando la malla…</LoadingLabel>
    <div className="academic-board academic-board--loading" aria-hidden="true">
      <div className="academic-columns" style={{ '--semester-count': 9 } as CSSProperties}>
        {Array.from({ length: 9 }, (_, semester) => <div className="academic-semester" key={semester}>
          <div className="academic-semester__header"><Skeleton width="24px" /></div>
          <ul>{Array.from({ length: 5 }, (_, course) => <li key={course} className="academic-course academic-course--loading">
            <Skeleton width={course % 2 === 0 ? '88%' : '68%'} /><Skeleton width="36px" />
          </li>)}</ul>
        </div>)}
      </div>
    </div>
  </>;
}

function ProgressSkeleton() {
  return <>
    <LoadingLabel>Cargando el avance curricular…</LoadingLabel>
    <div className="academic-student-summary" aria-hidden="true">
      <div className="academic-student-summary__person"><Skeleton className="academic-loading-avatar" width="34px" height="34px" /><div><Skeleton width="8rem" /><Skeleton width="6rem" /></div></div>
      <div className="academic-student-summary__credits"><Skeleton width="56%" height="18px" /><Skeleton height="8px" /><Skeleton width="85%" height="18px" /></div>
    </div>
  </>;
}

export function Academic() {
  const auth = useAuth();
  const account = auth.session!.account;
  const heading = useRef<HTMLHeadingElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const boardDrag = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragged: boolean } | null>(null);
  const sidebarState = useSidebar();
  const [pointerFocus, setPointerFocus] = useState(false);
  const [boardScroll, setBoardScroll] = useState({ previous: false, next: false });
  const [boardDragging, setBoardDragging] = useState(false);
  const [detail, setDetail] = useState<AcademicCourse | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  // El docente conserva al estudiante elegido en la URL para que recargar o volver no pierda el contexto.
  const [params, setParams] = useSearchParams();
  const requestedStudent = account.role === 'docente' && /^[0-9a-f-]{36}$/i.test(params.get('estudiante') ?? '') ? params.get('estudiante') : null;
  // Sólo la URL de llegada restaura una selección; después manda lo que el docente elige.
  const [pendingStudent, setPendingStudent] = useState(() => requestedStudent);
  const studentId = selectedStudent?.id ?? pendingStudent;
  function selectStudent(student: Student | null) {
    setDetail(null); setPendingStudent(null); setSelectedStudent(student);
    setParams(previous => { const next = new URLSearchParams(previous); if (student) next.set('estudiante', student.id); else next.delete('estudiante'); return next; }, { replace: true });
  }
  const [relationPreview, setRelationPreview] = useState<{ plan: AcademicPlan; code: string } | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { document.title = 'Cenit · Malla curricular'; return () => { document.title = 'Cenit'; }; }, []);
  const plans = useQuery({ queryKey: ['academic', account.id, 'plans'], queryFn: ({ signal }) => getPlans(signal), retry: retryAcademicRead });
  const available = plans.data?.find(plan => plan.planId === 'nutricion-dietetica');
  const version = available?.versions.find(v => v.version === 'diagrama-r2')?.version;
  const catalog = useQuery({
    queryKey: ['academic', account.id, available?.planId, version],
    queryFn: ({ signal }) => getPlan(available!.planId, version!, signal), enabled: Boolean(available && version), retry: retryAcademicRead,
  });
  const plan = catalog.data;
  const relationOrigin = detail?.code ?? (relationPreview?.plan === plan ? relationPreview?.code : undefined);
  const relations = useMemo(() => plan && relationOrigin ? courseRelations(plan, relationOrigin) : new Map<string, { depth: number; via: string }>(), [plan, relationOrigin]);
  function showRelations(code: string) {
    if (plan) setRelationPreview(previous => previous?.plan === plan && previous.code === code ? previous : { plan, code });
  }
  const hasStudent = account.role === 'estudiante' || studentId !== null;
  const progress = useQuery({
    queryKey: ['academic', account.id, 'progress', account.role === 'estudiante' ? 'me' : studentId, version],
    queryFn: ({ signal }) => getProgress(account.role === 'estudiante' ? null : studentId, signal),
    enabled: Boolean(plan) && hasStudent, retry: retryAcademicRead,
  });
  const restoredStudent = !selectedStudent && pendingStudent && progress.data?.student.id === pendingStudent ? progress.data.student : null;
  useEffect(() => { if (restoredStudent) { setSelectedStudent(restoredStudent); setPendingStudent(null); } }, [restoredStudent]);
  const restoringStudent = Boolean(pendingStudent) && !selectedStudent && !progress.error;
  const matchingProgress = progress.data?.plan.planId === plan?.planId && progress.data?.plan.version === plan?.version ? progress.data : undefined;
  const courseProgress = useMemo(() => new Map(matchingProgress?.courses.map(course => [course.code, course])), [matchingProgress]);
  const groups = useMemo(() => plan ? groupBySemester(plan.courses) : [], [plan]);
  const error = plans.error ?? catalog.error;
  const loading = plans.isPending || (Boolean(version) && catalog.isPending);
  const role = account.role === 'docente' ? 'Docente' : 'Estudiante';
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const update = () => {
      const previous = element.scrollLeft > 1;
      const next = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setBoardScroll(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [plan]);

  return <WorkspaceShell sidebarState={sidebarState} className={`academic-workspace${pointerFocus ? ' academic-workspace--pointer' : ''}`}
    rootProps={{ onPointerDownCapture: () => setPointerFocus(true), onKeyDownCapture: () => setPointerFocus(false) }}
    skip={{ href: '#academic-content', label: 'Ir a la malla' }} navigationId="academic-navigation" navigationLabel="Área académica"
    account={{ name: account.name, role }} accountActions={<AccountProfileLink to="/academico/perfil" />} logout={auth.logout}
    brand={<div className="workspace-brand">Cenit<span>Consulta académica</span></div>}
    navigation={<nav className="workspace-nav" aria-label="Navegación académica">
      <p className="workspace-eyebrow">Académico</p>
      <details className="academic-nav-group" open>
        <summary><CaretRightIcon className="academic-nav-group__caret" size={12} aria-hidden="true" /><GraduationCapIcon size={18} weight="regular" aria-hidden="true" /><span>Nutrición y Dietética</span></summary>
        <div className="academic-nav-group__items"><NavLink to="/academico" className={({ isActive }) => `workspace-nav-item${isActive ? ' workspace-nav-item--active' : ''}`}>
          {({ isActive }) => <><SquaresFourIcon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />Malla curricular</>}
        </NavLink></div>
      </details>
    </nav>}
    toolbarClassName="academic-toolbar cenit-page-enter"
    toolbarStart={<div><h1 ref={heading} tabIndex={-1}>Malla curricular</h1><p className="academic-toolbar__subtitle">{plan?.name ?? 'Nutrición y Dietética'}</p></div>}
    toolbarEnd={plan && catalogStatusLabels[plan.source.validationStatus] && <div className="academic-toolbar__meta">
      <span className="academic-tag">{catalogStatusLabels[plan.source.validationStatus]}</span>
    </div>}>
        <main id="academic-content" className="academic-content" tabIndex={-1}>
          <SessionWarning expiresAt={auth.session!.expiresAt} logout={auth.logout} />
          {error && <div className="cenit-empty"><span className="cenit-empty__icon"><InfoIcon size={26} aria-hidden="true" /></span><h2>{error instanceof HttpError && error.status === 403 ? 'Acceso no autorizado' : 'No pudimos cargar la malla'}</h2><p role="alert">{error.message}</p><button className="cenit-button" type="button" onClick={() => { void (plans.error ? plans.refetch() : catalog.refetch()); }}>Reintentar</button></div>}
          {!loading && !error && !version && <div className="cenit-empty"><span className="cenit-empty__icon"><BookOpenIcon size={26} aria-hidden="true" /></span><h2>La malla todavía no está disponible</h2><p>La malla vigente de Nutrición y Dietética aún no está publicada.</p><button className="cenit-button" type="button" onClick={() => { void plans.refetch(); }}>Volver a consultar</button></div>}
          {!error && (loading || plan) && <>
            <div className="academic-board-context">
            <section className="academic-progress-context" aria-label="Avance curricular">
              {account.role === 'docente' && !restoringStudent && <StudentLookup accountId={account.id} selected={selectedStudent} onSelect={selectStudent} />}
              {hasStudent && <>
              {progress.isPending && <ProgressSkeleton />}
              {progress.error && <div className="academic-inline-error"><p role="alert">{progress.error instanceof HttpError && progress.error.status === 404 ? 'Este estudiante aún no tiene un perfil académico preparado.' : progress.error.message}</p><button className="cenit-button" onClick={() => { void progress.refetch(); }}>Reintentar historial</button></div>}
              {!progress.error && plan && matchingProgress && <StudentProgressSummary plan={plan} progress={matchingProgress} />}
              {!progress.error && matchingProgress && <><ul className="academic-progress-legend" aria-label="Estados del historial">{Object.entries(progressLabels).map(([status, label]) => <li key={status}><span className={`academic-progress-dot academic-progress-dot--${status}`} aria-hidden="true" />{label}</li>)}</ul></>}
              </>}
            </section>
            {plan && (boardScroll.previous || boardScroll.next) && <div className="academic-board-actions" role="group" aria-label="Navegación de semestres">
              <span className="academic-board-hint">Arrastra para recorrer</span>
              <button className="cenit-button cenit-button--icon" type="button" aria-label="Ver semestres anteriores" aria-controls="academic-semesters" disabled={!boardScroll.previous} onClick={() => board.current?.scrollBy({ left: -board.current.clientWidth * .8 })}><CaretLeftIcon size={16} weight="regular" aria-hidden="true" /></button>
              <button className="cenit-button cenit-button--icon" type="button" aria-label="Ver semestres siguientes" aria-controls="academic-semesters" disabled={!boardScroll.next} onClick={() => board.current?.scrollBy({ left: board.current.clientWidth * .8 })}><CaretRightIcon size={16} weight="regular" aria-hidden="true" /></button>
            </div>}
            </div>
            {loading && <BoardSkeleton />}
          </>}
          {!error && plan && <>
            <p id="academic-scroll-hint" className="academic-sr-only">Asignaturas por semestre. Abre una asignatura para consultar su nombre completo, historial y prerrequisitos. Arrastra con el mouse o usa los controles de semestres y las flechas del teclado para recorrer el tablero cuando no quepa completo.</p>
            <div ref={board} id="academic-semesters" className={`academic-board${boardScroll.previous || boardScroll.next ? ' academic-board--scrollable' : ''}${boardDragging ? ' academic-board--dragging' : ''}`} tabIndex={0} role="region" aria-label="Asignaturas por semestre" aria-describedby="academic-scroll-hint"
              onPointerDown={event => {
                boardDrag.current = null;
                if (event.pointerType !== 'mouse' || event.button !== 0 || !(boardScroll.previous || boardScroll.next)) return;
                boardDrag.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft, dragged: false };
              }}
              onPointerMove={event => {
                const drag = boardDrag.current;
                if (!drag || drag.pointerId !== event.pointerId || event.buttons !== 1) return;
                const distance = event.clientX - drag.startX;
                if (!drag.dragged && Math.abs(distance) < 5) return;
                if (!drag.dragged) {
                  drag.dragged = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setBoardDragging(true); setRelationPreview(null);
                }
                event.preventDefault();
                event.currentTarget.scrollTo({ left: drag.scrollLeft - distance, behavior: 'instant' });
              }}
              onPointerUp={() => { setBoardDragging(false); if (!boardDrag.current?.dragged) boardDrag.current = null; }}
              onPointerCancel={() => { setBoardDragging(false); boardDrag.current = null; }}
              onLostPointerCapture={() => setBoardDragging(false)} onDragStart={event => event.preventDefault()}
              onClickCapture={event => { if (boardDrag.current?.dragged) { event.preventDefault(); event.stopPropagation(); boardDrag.current = null; } }}
              onPointerLeave={() => { if (!boardDrag.current?.dragged) boardDrag.current = null; }} onKeyDown={event => { boardDrag.current = null; setBoardDragging(false); if (event.key === 'Escape') setRelationPreview(null); }}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRelationPreview(null); }}>
              <div className={`academic-columns${relationOrigin ? ' academic-columns--relations' : ''}`} style={{ '--semester-count': groups.length } as CSSProperties}>
                {groups.map(group => {
                  const title = semesterLabel(group.semester, group.semesterEnd), numeral = title.replace(/^Semestres? /, '');
                  return <section className="academic-semester" key={`${group.semester}-${group.semesterEnd}`} aria-label={title}>
                    <header className="academic-semester__header"><h2 aria-label={title}>{numeral}</h2></header>
                    <ul>{group.courses.map(course => {
                      const record = !progress.error ? courseProgress.get(course.code) : undefined;
                      const label = courseLabel(course.name);
                      const linked = relations.get(course.code);
                      const relation = course.code === relationOrigin ? 'origin' : linked ? (linked.depth === 1 ? 'direct' : 'indirect') : undefined;
                      return <li key={course.code}><button data-course-code={course.code} data-relation={relation} className={`academic-course${record ? ` academic-course--${record.status}` : ''}${relation ? ` academic-course--relation-${relation}` : ''}`} type="button" aria-label={`Ver asignatura: ${label}${label !== course.name ? ` (${course.name})` : ''}`} aria-describedby={`academic-course-meta-${course.code}`}
                        onPointerEnter={event => { if (event.pointerType === 'mouse' && !boardDrag.current?.dragged) showRelations(course.code); }}
                        onPointerLeave={event => {
                          if (event.pointerType !== 'mouse') return;
                          const focused = document.activeElement;
                          const focusedCode = !pointerFocus && focused instanceof HTMLElement && board.current?.contains(focused) && focused.matches(':focus-visible') ? focused.dataset.courseCode : undefined;
                          if (focusedCode) showRelations(focusedCode); else setRelationPreview(null);
                        }}
                        onFocus={event => { if (!pointerFocus && event.currentTarget.matches(':focus-visible')) showRelations(course.code); }} onClick={event => {
                        // Safari no enfoca botones al pulsarlos; el diálogo debe regresar al ramo.
                        event.currentTarget.focus({ preventScroll: true });
                        setDetail(course);
                      }}>
                        <span className="academic-course__origin-ring" aria-hidden="true" />
                        <span className="academic-course__name">{label}</span>
                        <span id={`academic-course-meta-${course.code}`} className="academic-course__footer">
                          {relation && <span className="academic-sr-only">{relation === 'origin' ? 'Origen de la cadena' : relation === 'direct' ? 'Relación directa' : 'Relación indirecta'}. Relación de referencia.</span>}
                          {record && <span className={`academic-progress-badge academic-progress-badge--${record.status}`}>{progressLabels[record.status]}</span>}
                          <span>{course.credits === null ? 'SCT no informados' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(course.credits)} SCT`}</span>
                        </span>
                      </button></li>;
                    })}</ul>
                  </section>;
                })}
              </div>
            </div>
            {relationOrigin && <div className="academic-relation-legend" aria-label="Relaciones resaltadas"><span className="academic-relation-key academic-relation-key--origin">Origen</span><span className="academic-relation-key academic-relation-key--direct">Directa</span><span className="academic-relation-key academic-relation-key--indirect">Indirecta</span>{!plan.isExample && <span>Relaciones de referencia</span>}</div>}
          </>}
        </main>
    {detail !== null && plan && !error && <CatalogDetails key={detail.code} course={detail} plan={plan} progress={!progress.error ? courseProgress.get(detail.code) : undefined} student={matchingProgress?.student} statuses={!progress.error ? courseProgress : undefined} onClose={() => setDetail(null)} />}
  </WorkspaceShell>;
}
