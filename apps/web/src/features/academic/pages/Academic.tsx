import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { GraduationCapIcon } from '@phosphor-icons/react/dist/csr/GraduationCap';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { AcademicCourse, AcademicPlan } from '@cenit/contracts/academic';
import { useAuth } from '../../auth/model/session.js';
import { SessionWarning } from '../../auth/components/SessionWarning.js';
import { HttpError } from '../../../shared/lib/http.js';
import { getPlans, getPlan, getProgress, retryAcademicRead } from '../api/academic.js';
import { groupBySemester, semesterLabel } from '../model/group-by-semester.js';
import { courseLabel } from '../model/course-label.js';
import { CatalogDetails } from '../components/CatalogDetails.js';
import { StudentLookup, type Student } from '../components/StudentLookup.js';
import { progressLabels } from '../model/progress-presentation.js';
import { courseRelations } from '../model/course-relations.js';
import { useSidebar } from '../../../shared/lib/use-sidebar.js';
import '../academic.css';

export function Academic() {
  const auth = useAuth();
  const account = auth.session!.account;
  const heading = useRef<HTMLHeadingElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const boardDrag = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragged: boolean } | null>(null);
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed, mobile, sidebar, panel, toggle, mounted, closing } = useSidebar('/academico', 720);
  const [pointerFocus, setPointerFocus] = useState(false);
  const [boardScroll, setBoardScroll] = useState({ previous: false, next: false });
  const [boardDragging, setBoardDragging] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [detail, setDetail] = useState<AcademicCourse | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [relationPreview, setRelationPreview] = useState<{ plan: AcademicPlan; code: string } | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { document.title = 'Cenit · Malla curricular'; return () => { document.title = 'Cenit'; }; }, []);
  const plans = useQuery({ queryKey: ['academic', account.id, 'plans'], queryFn: ({ signal }) => getPlans(signal), retry: retryAcademicRead });
  const available = plans.data?.find(plan => plan.planId === 'nutricion-dietetica');
  const version = available?.versions.find(v => v.version === selectedVersion)?.version ?? available?.versions[0]?.version;
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
  const hasStudent = account.role === 'estudiante' || selectedStudent !== null;
  const progress = useQuery({
    queryKey: ['academic', account.id, 'progress', account.role === 'estudiante' ? 'me' : selectedStudent?.id, version],
    queryFn: ({ signal }) => getProgress(account.role === 'estudiante' ? null : selectedStudent!.id, signal),
    enabled: Boolean(plan) && hasStudent, retry: retryAcademicRead,
  });
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

  return <div className={`academic-workspace${pointerFocus ? ' academic-workspace--pointer' : ''}`} onPointerDownCapture={() => setPointerFocus(true)} onKeyDownCapture={() => setPointerFocus(false)}>
    <a className="academic-skip" href="#academic-content">Ir a la malla</a>
    <div className={`academic-shell${sidebarCollapsed ? ' academic-shell--collapsed' : ''}`}>
      {mobile && mounted && <div className={`workspace-nav-overlay${closing ? ' workspace-nav-overlay--closing' : ''}`} aria-hidden="true" onClick={() => setSidebarCollapsed(true)} />}
      <aside ref={sidebar} id="academic-navigation" className="academic-sidebar" aria-label="Área académica" inert={sidebarCollapsed} aria-hidden={sidebarCollapsed} role={mobile ? 'dialog' : undefined} aria-modal={mobile && !sidebarCollapsed ? true : undefined}>
        <div className="workspace-sidebar-content">
        <button type="button" className="workspace-nav-close academic-icon-button" aria-label="Cerrar navegación" onClick={() => setSidebarCollapsed(true)}><XIcon size={20} aria-hidden="true" /></button>
        <div className="academic-brand">Cenit</div>
        <nav className="academic-navigation" aria-label="Navegación académica">
          <p className="academic-eyebrow">Académico</p>
          <details className="academic-nav-group" open>
            <summary><CaretRightIcon className="academic-nav-group__caret" size={12} aria-hidden="true" /><GraduationCapIcon size={17} weight="regular" aria-hidden="true" /><span>Nutrición y Dietética</span></summary>
            <div className="academic-nav-group__items"><NavLink to="/academico" onClick={() => { if (mobile) setSidebarCollapsed(true); }} className={({ isActive }) => `academic-nav-item${isActive ? ' academic-nav-item--active' : ''}`}>
              {({ isActive }) => <><SquaresFourIcon size={17} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />Malla curricular</>}
            </NavLink></div>
          </details>
        </nav>
        <div className="academic-sidebar__bottom">
          <button className="academic-nav-item" type="button" onClick={() => { void auth.logout(); }}><SignOutIcon size={17} weight="regular" aria-hidden="true" />Cerrar sesión</button>
          <div className="academic-account"><span className="academic-account__avatar" aria-hidden="true">{account.name.trim().charAt(0)}</span><div><strong>{account.name}</strong><span>{role}</span></div></div>
        </div>
        </div>
      </aside>
      <div ref={panel} className="academic-main">
        <header className="academic-toolbar cenit-page-enter">
          <div className="academic-toolbar__title">
            <button ref={toggle} type="button" className="academic-sidebar-toggle academic-icon-button" aria-label={sidebarCollapsed ? 'Mostrar navegación' : 'Ocultar navegación'} aria-expanded={!sidebarCollapsed} aria-controls="academic-navigation" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}><SidebarSimpleIcon size={20} weight="regular" aria-hidden="true" /></button>
            <div><h1 ref={heading} tabIndex={-1}>Malla curricular</h1><p className="academic-toolbar__subtitle">{plan?.name ?? 'Nutrición y Dietética'}</p></div>
          </div>
          <div className="academic-toolbar__tools">
            <div className="academic-toolbar__meta">
              {version && (available!.versions.length > 1 ? <label className="academic-version">Versión<select aria-label="Versión del plan" value={version} onChange={event => { setDetail(null); setSelectedVersion(event.target.value); }}>{available!.versions.map(v => <option value={v.version} key={v.version}>{v.version}</option>)}</select></label> : <span className="academic-version">Versión {version}</span>)}
              <span className="academic-tag">Demostración</span>
            </div>
            <p className="academic-mobile-account">{account.name} · {role}</p>
            <button type="button" className="academic-mobile-logout academic-icon-button" aria-label="Cerrar sesión" onClick={() => { void auth.logout(); }}><SignOutIcon size={18} aria-hidden="true" /></button>
          </div>
        </header>
        <main id="academic-content" className="academic-content" tabIndex={-1}>
          <SessionWarning expiresAt={auth.session!.expiresAt} logout={auth.logout} />
          {loading && !error && <div className="academic-state"><span className="academic-loading" aria-hidden="true" /><p role="status">Cargando la malla…</p></div>}
          {error && <div className="academic-state"><InfoIcon size={24} aria-hidden="true" /><h2>{error instanceof HttpError && error.status === 403 ? 'Acceso no autorizado' : 'No pudimos cargar la malla'}</h2><p role="alert">{error.message}</p><button className="academic-button" type="button" onClick={() => { void (plans.error ? plans.refetch() : catalog.refetch()); }}>Reintentar</button></div>}
          {!loading && !error && !version && <div className="academic-state"><BookOpenIcon size={28} weight="regular" aria-hidden="true" /><h2>La malla todavía no está disponible</h2><p>No hay una versión publicada de Nutrición y Dietética para consultar.</p><button className="academic-button" type="button" onClick={() => { void plans.refetch(); }}>Volver a consultar</button></div>}
          {!error && plan && <>
            <div className="academic-board-context">
            <section className="academic-progress-context" aria-label="Avance curricular">
              {account.role === 'docente' && <StudentLookup accountId={account.id} selected={selectedStudent} onSelect={student => { setDetail(null); setSelectedStudent(student); }} />}
              {hasStudent && <>
              {progress.isPending && <p role="status">Cargando el avance curricular…</p>}
              {progress.error && <div className="academic-inline-error"><p role="alert">{progress.error instanceof HttpError && progress.error.status === 404 ? 'Este estudiante aún no tiene un perfil académico preparado.' : progress.error.message}</p><button className="academic-button" onClick={() => { void progress.refetch(); }}>Reintentar historial</button></div>}
              {!progress.error && matchingProgress && <>{account.role === 'estudiante' && <p className="academic-student-identity"><strong>{matchingProgress.student.name}</strong><span>RUT {matchingProgress.student.rut}</span></p>}<ul className="academic-progress-legend" aria-label="Estados del historial">{Object.entries(progressLabels).map(([status, label]) => <li key={status}><span className={`academic-progress-dot academic-progress-dot--${status}`} aria-hidden="true" />{label}</li>)}</ul></>}
              {!progress.error && progress.data && !matchingProgress && <p role="status">El historial pertenece a la versión {progress.data.plan.version}. Selecciona esa versión para consultarlo sobre la malla.</p>}
              </>}
            </section>
            {(boardScroll.previous || boardScroll.next) && <div className="academic-board-actions" role="group" aria-label="Navegación de semestres">
              <span className="academic-board-hint">Arrastra para recorrer</span>
              <button className="academic-icon-button" type="button" aria-label="Ver semestres anteriores" aria-controls="academic-semesters" disabled={!boardScroll.previous} onClick={() => board.current?.scrollBy({ left: -board.current.clientWidth * .8 })}><CaretLeftIcon size={16} weight="regular" aria-hidden="true" /></button>
              <button className="academic-icon-button" type="button" aria-label="Ver semestres siguientes" aria-controls="academic-semesters" disabled={!boardScroll.next} onClick={() => board.current?.scrollBy({ left: board.current.clientWidth * .8 })}><CaretRightIcon size={16} weight="regular" aria-hidden="true" /></button>
            </div>}
            </div>
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
              onPointerLeave={() => { if (!boardDrag.current?.dragged) boardDrag.current = null; setRelationPreview(null); }} onKeyDown={event => { boardDrag.current = null; setBoardDragging(false); if (event.key === 'Escape') setRelationPreview(null); }}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRelationPreview(null); }}>
              <div className={`academic-columns${relationOrigin ? ' academic-columns--relations' : ''}`} style={{ '--semester-count': groups.length } as CSSProperties}>
                {groups.map(group => {
                  const title = semesterLabel(group.semester, group.semesterEnd), numeral = title.replace(/^Semestres? /, '');
                  return <section className="academic-semester" key={`${group.semester}-${group.semesterEnd}`} aria-label={title}>
                    <header className="academic-semester__header"><h2 aria-label={title} data-prefix={title.slice(0, title.length - numeral.length)}>{numeral}</h2></header>
                    <ul>{group.courses.map(course => {
                      const record = !progress.error ? courseProgress.get(course.code) : undefined;
                      const label = courseLabel(course.name);
                      const linked = relations.get(course.code);
                      const relation = course.code === relationOrigin ? 'origin' : linked ? (linked.depth === 1 ? 'direct' : 'indirect') : undefined;
                      return <li key={course.code}><button data-course-code={course.code} data-relation={relation} className={`academic-course${record ? ` academic-course--${record.status}` : ''}${relation ? ` academic-course--relation-${relation}` : ''}`} type="button" aria-label={`Ver asignatura: ${label}${label !== course.name ? ` (${course.name})` : ''}`} aria-describedby={`academic-course-meta-${course.code}`}
                        onPointerEnter={event => { if (event.pointerType === 'mouse' && !boardDrag.current?.dragged) showRelations(course.code); }}
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
      </div>
    </div>
    {detail !== null && plan && !error && <CatalogDetails key={detail.code} course={detail} plan={plan} progress={!progress.error ? courseProgress.get(detail.code) : undefined} student={matchingProgress?.student} onClose={() => setDetail(null)} />}
  </div>;
}
