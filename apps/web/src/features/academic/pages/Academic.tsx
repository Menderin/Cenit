import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { BookOpen, CaretRight, GraduationCap, Info, SidebarSimple, SignOut, SquaresFour } from '@phosphor-icons/react';
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
import '../academic.css';

export function Academic() {
  const auth = useAuth();
  const account = auth.session!.account;
  const heading = useRef<HTMLHeadingElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pointerFocus, setPointerFocus] = useState(false);
  const [boardOverflow, setBoardOverflow] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [detail, setDetail] = useState<AcademicCourse | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [relationPreview, setRelationPreview] = useState<{ plan: AcademicPlan; code: string } | null>(null);
  const relationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelRelationTimer = () => clearTimeout(relationTimer.current);
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
  useEffect(() => () => clearTimeout(relationTimer.current), [plan]);
  const relationOrigin = detail?.code ?? (relationPreview?.plan === plan ? relationPreview?.code : undefined);
  const relations = plan && relationOrigin ? courseRelations(plan, relationOrigin) : new Map();
  const hasStudent = account.role === 'estudiante' || selectedStudent !== null;
  const progress = useQuery({
    queryKey: ['academic', account.id, 'progress', account.role === 'estudiante' ? 'me' : selectedStudent?.id, version],
    queryFn: ({ signal }) => getProgress(account.role === 'estudiante' ? null : selectedStudent!.id, signal),
    enabled: Boolean(plan) && hasStudent, retry: retryAcademicRead,
  });
  const matchingProgress = progress.data?.plan.planId === plan?.planId && progress.data?.plan.version === plan?.version ? progress.data : undefined;
  const courseProgress = new Map(matchingProgress?.courses.map(course => [course.code, course]));
  const groups = plan ? groupBySemester(plan.courses) : [];
  const error = plans.error ?? catalog.error;
  const loading = plans.isPending || (Boolean(version) && catalog.isPending);
  const role = account.role === 'docente' ? 'Docente' : 'Estudiante';
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const update = () => setBoardOverflow(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [plan]);

  return <main className={`academic-workspace${pointerFocus ? ' academic-workspace--pointer' : ''}`} onPointerDownCapture={() => setPointerFocus(true)} onKeyDownCapture={() => setPointerFocus(false)}>
    <a className="academic-skip" href="#academic-content">Ir a la malla</a>
    <div className={`academic-shell${sidebarCollapsed ? ' academic-shell--collapsed' : ''}`}>
      <aside id="academic-navigation" className="academic-sidebar" aria-label="Área académica">
        <div className="academic-brand">Cenit</div>
        <nav className="academic-navigation" aria-label="Navegación académica">
          <p className="academic-eyebrow">Académico</p>
          <details className="academic-nav-group" open>
            <summary><CaretRight className="academic-nav-group__caret" size={12} aria-hidden="true" /><GraduationCap size={17} weight="regular" aria-hidden="true" /><span>Nutrición y Dietética</span></summary>
            <div className="academic-nav-group__items"><NavLink to="/academico" className={({ isActive }) => `academic-nav-item${isActive ? ' academic-nav-item--active' : ''}`}>
              {({ isActive }) => <><SquaresFour size={17} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />Malla curricular</>}
            </NavLink></div>
          </details>
        </nav>
        <div className="academic-sidebar__bottom">
          <button className="academic-nav-item" type="button" onClick={() => { void auth.logout(); }}><SignOut size={17} weight="regular" aria-hidden="true" />Cerrar sesión</button>
          <div className="academic-account"><span className="academic-account__avatar" aria-hidden="true">{account.name.trim().charAt(0)}</span><div><strong>{account.name}</strong><span>{role}</span></div></div>
        </div>
      </aside>
      <div className="academic-main">
        <header className="academic-toolbar cenit-page-enter">
          <div className="academic-toolbar__title">
            <button type="button" className="academic-sidebar-toggle academic-icon-button" aria-label={sidebarCollapsed ? 'Mostrar navegación' : 'Ocultar navegación'} aria-expanded={!sidebarCollapsed} aria-controls="academic-navigation" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}><SidebarSimple size={18} weight="regular" aria-hidden="true" /></button>
            <div><h1 ref={heading} tabIndex={-1}>Malla curricular</h1><p className="academic-toolbar__subtitle">{plan?.name ?? 'Nutrición y Dietética'}{plan?.isExample && ' · Plan de ejemplo'}</p></div>
          </div>
          <div className="academic-toolbar__tools">
            {version && available!.versions.length > 1 && <label className="academic-version">Plan<select aria-label="Versión del plan" value={version} onChange={event => { setDetail(null); setSelectedVersion(event.target.value); }}>{available!.versions.map(v => <option value={v.version} key={v.version}>{v.version}</option>)}</select></label>}
            <span className="academic-tag">Demostración</span>
            <button type="button" className="academic-mobile-logout academic-icon-button" aria-label="Cerrar sesión" onClick={() => { void auth.logout(); }}><SignOut size={18} aria-hidden="true" /></button>
          </div>
          <p className="academic-mobile-account">{account.name} · {role}</p>
        </header>
        <div id="academic-content" className="academic-content" tabIndex={-1}>
          <SessionWarning expiresAt={auth.session!.expiresAt} logout={auth.logout} />
          {loading && !error && <div className="academic-state"><span className="academic-loading" aria-hidden="true" /><p role="status">Cargando la malla…</p></div>}
          {error && <div className="academic-state"><Info size={24} aria-hidden="true" /><h2>{error instanceof HttpError && error.status === 403 ? 'Acceso no autorizado' : 'No pudimos cargar la malla'}</h2><p role="alert">{error.message}</p><button className="academic-button" type="button" onClick={() => { void (plans.error ? plans.refetch() : catalog.refetch()); }}>Reintentar</button></div>}
          {!loading && !error && !version && <div className="academic-state"><BookOpen size={28} weight="regular" aria-hidden="true" /><h2>La malla todavía no está disponible</h2><p>No hay una versión publicada de Nutrición y Dietética para consultar.</p><button className="academic-button" type="button" onClick={() => { void plans.refetch(); }}>Volver a consultar</button></div>}
          {!error && plan && <>
            <section className="academic-progress-context" aria-label="Avance curricular">
              {account.role === 'docente' && <StudentLookup accountId={account.id} selected={selectedStudent} onSelect={student => { setDetail(null); setSelectedStudent(student); }} />}
              {hasStudent && <>
              {progress.isPending && <p role="status">Cargando el avance curricular…</p>}
              {progress.error && <div className="academic-inline-error"><p role="alert">{progress.error instanceof HttpError && progress.error.status === 404 ? 'Este estudiante aún no tiene un perfil académico preparado.' : progress.error.message}</p><button className="academic-button" onClick={() => { void progress.refetch(); }}>Reintentar historial</button></div>}
              {!progress.error && matchingProgress && <>{account.role === 'estudiante' && <p className="academic-student-identity"><strong>{matchingProgress.student.name}</strong><span>RUT {matchingProgress.student.rut}</span></p>}<ul className="academic-progress-legend" aria-label="Estados del historial">{Object.entries(progressLabels).map(([status, label]) => <li key={status}><span className={`academic-progress-dot academic-progress-dot--${status}`} aria-hidden="true" />{label}</li>)}</ul></>}
              {!progress.error && progress.data && !matchingProgress && <p role="status">El historial pertenece a la versión {progress.data.plan.version}. Selecciona esa versión para consultarlo sobre la malla.</p>}
              </>}
            </section>
            {boardOverflow && <div className="academic-board-meta"><span className="academic-scroll-hint">Desplaza para ver más <CaretRight size={12} aria-hidden="true" /></span></div>}
            <p id="academic-scroll-hint" className="academic-sr-only">Asignaturas por semestre. Abre una asignatura para consultar su nombre completo, historial y prerrequisitos. Usa las flechas del teclado para recorrer el tablero cuando no quepa completo.</p>
            <div ref={board} className="academic-board" tabIndex={0} role="region" aria-label="Asignaturas por semestre" aria-describedby="academic-scroll-hint"
              onPointerLeave={() => { cancelRelationTimer(); setRelationPreview(null); }} onKeyDown={event => { if (event.key === 'Escape') { cancelRelationTimer(); setRelationPreview(null); } }}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { cancelRelationTimer(); setRelationPreview(null); } }}>
              <div className={`academic-columns${relationOrigin ? ' academic-columns--relations' : ''}`} style={{ '--semester-count': groups.length } as CSSProperties}>
                {groups.map(group => {
                  const title = semesterLabel(group.semester, group.semesterEnd);
                  return <section className="academic-semester" key={`${group.semester}-${group.semesterEnd}`} aria-label={title}>
                    <header className="academic-semester__header"><h2 aria-label={title}>{title.replace(/^Semestres? /, '')}</h2></header>
                    <ul>{group.courses.map(course => {
                      const record = !progress.error ? courseProgress.get(course.code) : undefined;
                      const label = courseLabel(course.name);
                      const relation = course.code === relationOrigin ? 'origin' : relations.has(course.code) ? (relations.get(course.code)!.depth === 1 ? 'direct' : 'indirect') : undefined;
                      return <li key={course.code}><button data-course-code={course.code} data-relation={relation} className={`academic-course${record ? ` academic-course--${record.status}` : ''}${relation ? ` academic-course--relation-${relation}` : ''}`} type="button" aria-label={`Ver asignatura: ${label}${label !== course.name ? ` (${course.name})` : ''}`} aria-describedby={`academic-course-meta-${course.code}`}
                        onPointerEnter={event => { if (event.pointerType !== 'mouse') return; cancelRelationTimer(); relationTimer.current = setTimeout(() => setRelationPreview({ plan, code: course.code }), 120); }}
                        onPointerLeave={cancelRelationTimer}
                        onFocus={event => { if (!pointerFocus && event.currentTarget.matches(':focus-visible')) { cancelRelationTimer(); setRelationPreview({ plan, code: course.code }); } }} onClick={event => {
                        cancelRelationTimer();
                        // Safari no enfoca botones al pulsarlos; el diálogo debe regresar al ramo.
                        event.currentTarget.focus({ preventScroll: true });
                        setDetail(course);
                      }}>
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
            {relationOrigin && <div className="academic-relation-legend" aria-label="Relaciones resaltadas"><span className="academic-relation-key academic-relation-key--origin">Origen</span><span className="academic-relation-key academic-relation-key--direct">Directa</span><span className="academic-relation-key academic-relation-key--indirect">Indirecta</span><span>{plan.isExample ? 'Conexiones ficticias' : 'Relaciones por confirmar'}</span></div>}
          </>}
        </div>
      </div>
    </div>
    {detail !== null && plan && !error && <CatalogDetails key={detail.code} course={detail} plan={plan} progress={!progress.error ? courseProgress.get(detail.code) : undefined} student={matchingProgress?.student} onClose={() => setDetail(null)} />}
  </main>;
}
