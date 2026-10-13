import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { BookOpen, CaretRight, GraduationCap, Info, SignOut, SquaresFour } from '@phosphor-icons/react';
import type { AcademicCourse } from '@cenit/contracts/academic';
import { useAuth } from '../../auth/model/session.js';
import { SessionWarning } from '../../auth/components/SessionWarning.js';
import { HttpError } from '../../../shared/lib/http.js';
import { getPlans, getPlan, getProgress, retryAcademicRead } from '../api/academic.js';
import { groupBySemester, semesterLabel } from '../model/group-by-semester.js';
import { CatalogDetails } from '../components/CatalogDetails.js';
import { StudentLookup, type Student } from '../components/StudentLookup.js';
import { progressLabels } from '../model/progress-presentation.js';
import '../academic.css';

export function Academic() {
  const auth = useAuth();
  const account = auth.session!.account;
  const heading = useRef<HTMLHeadingElement>(null);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [detail, setDetail] = useState<AcademicCourse | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const plans = useQuery({ queryKey: ['academic', account.id, 'plans'], queryFn: ({ signal }) => getPlans(signal), retry: retryAcademicRead });
  const available = plans.data?.find(plan => plan.planId === 'nutricion-dietetica');
  const version = available?.versions.find(v => v.version === selectedVersion)?.version ?? available?.versions[0]?.version;
  const catalog = useQuery({
    queryKey: ['academic', account.id, available?.planId, version],
    queryFn: ({ signal }) => getPlan(available!.planId, version!, signal), enabled: Boolean(available && version), retry: retryAcademicRead,
  });
  const plan = catalog.data;
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

  return <main className="academic-workspace">
    <a className="academic-skip" href="#academic-content">Ir a la malla</a>
    <div className="academic-shell">
      <aside className="academic-sidebar" aria-label="Área académica">
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
        <header className="academic-context"><div><GraduationCap size={17} weight="regular" aria-hidden="true" /><span>Académico</span><CaretRight size={12} aria-hidden="true" /><span>Nutrición y Dietética</span></div><span className="academic-tag">Demostración</span><button type="button" className="academic-mobile-logout academic-icon-button" aria-label="Cerrar sesión" onClick={() => { void auth.logout(); }}><SignOut size={18} aria-hidden="true" /></button><p className="academic-mobile-account">{account.name} · {role} · Demostración</p></header>
        <div className="academic-toolbar"><div><h1 ref={heading} tabIndex={-1}>Malla curricular</h1><span className="academic-view"><SquaresFour size={15} weight="fill" aria-hidden="true" />Por semestres</span></div></div>
        <div id="academic-content" className="academic-content" tabIndex={-1}>
          <SessionWarning expiresAt={auth.session!.expiresAt} logout={auth.logout} />
          {loading && !error && <div className="academic-state"><span className="academic-loading" aria-hidden="true" /><p role="status">Cargando la malla…</p></div>}
          {error && <div className="academic-state"><Info size={24} aria-hidden="true" /><h2>{error instanceof HttpError && error.status === 403 ? 'Acceso no autorizado' : 'No pudimos cargar la malla'}</h2><p role="alert">{error.message}</p><button className="academic-button" type="button" onClick={() => { void (plans.error ? plans.refetch() : catalog.refetch()); }}>Reintentar</button></div>}
          {!loading && !error && !version && <div className="academic-state"><BookOpen size={28} weight="regular" aria-hidden="true" /><h2>La malla todavía no está disponible</h2><p>No hay una versión publicada de Nutrición y Dietética para consultar.</p><button className="academic-button" type="button" onClick={() => { void plans.refetch(); }}>Volver a consultar</button></div>}
          {!error && plan && <>
            {account.role === 'docente' && <StudentLookup accountId={account.id} selected={selectedStudent} onSelect={student => { setDetail(null); setSelectedStudent(student); }} />}
            <div className="academic-plan-heading"><div><h2>{plan.name}</h2><p>{plan.courses.length} asignaturas{plan.isExample && ' · Plan de ejemplo'}</p></div><label className="academic-version">Versión del plan<select value={version} onChange={event => { setDetail(null); setSelectedVersion(event.target.value); }}>{available!.versions.map(v => <option value={v.version} key={v.version}>{v.version}</option>)}</select></label></div>
            {hasStudent && <section className="academic-progress-context" aria-label="Avance curricular">
              {progress.isPending && <p role="status">Cargando el avance curricular…</p>}
              {progress.error && <div className="academic-inline-error"><p role="alert">{progress.error instanceof HttpError && progress.error.status === 404 ? 'Este estudiante aún no tiene un perfil académico preparado.' : progress.error.message}</p><button className="academic-button" onClick={() => { void progress.refetch(); }}>Reintentar historial</button></div>}
              {!progress.error && matchingProgress && <><div className="academic-progress-context__student"><div><h3>{account.role === 'estudiante' ? 'Mi avance curricular' : 'Avance curricular'} · {matchingProgress.student.name}</h3><p>RUT {matchingProgress.student.rut} · Historial ficticio de demostración</p></div>{account.role === 'docente' && <button className="academic-button" onClick={() => { setDetail(null); setSelectedStudent(null); }}>Ver sólo catálogo</button>}</div><ul className="academic-progress-legend" aria-label="Estados del historial">{Object.entries(progressLabels).map(([status, label]) => <li key={status}><span className={`academic-progress-dot academic-progress-dot--${status}`} aria-hidden="true" />{label}</li>)}</ul></>}
              {!progress.error && progress.data && !matchingProgress && <p role="status">El historial pertenece a la versión {progress.data.plan.version}. Selecciona esa versión para consultarlo sobre la malla.</p>}
            </section>}
            <p id="academic-scroll-hint" className="academic-scroll-hint">Consulta una asignatura para ver su detalle.<span className="academic-scroll-hint__horizontal"> Desplázate horizontalmente para recorrer los semestres.</span></p>
            <div className="academic-board" tabIndex={0} role="region" aria-label="Asignaturas por semestre" aria-describedby="academic-scroll-hint">
              <div className="academic-columns" style={{ '--semester-count': groups.length } as CSSProperties}>
                {groups.map(group => {
                  const title = semesterLabel(group.semester, group.semesterEnd);
                  const credits = group.courses.every(c => c.credits !== null) ? group.courses.reduce((sum, c) => sum + c.credits!, 0) : null;
                  return <section className="academic-semester" key={`${group.semester}-${group.semesterEnd}`} aria-label={title}>
                    <header className="academic-semester__header"><span>Año {Math.ceil(group.semester / 2)}</span><h3>{title}</h3><p>{group.courses.length} asignaturas{credits !== null && ` · ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(credits)} SCT`}</p></header>
                    <ul>{group.courses.map(course => {
                      const record = !progress.error ? courseProgress.get(course.code) : undefined;
                      const grade = record?.attempts.at(-1)?.grade;
                      return <li key={course.code}><button className={`academic-course${record ? ` academic-course--${record.status}` : ''}`} type="button" aria-label={`Ver asignatura: ${course.name}`} onClick={() => setDetail(course)}>
                        <span className="academic-course__name">{course.name}</span>
                        {record && <span className={`academic-progress-badge academic-progress-badge--${record.status}`}>{progressLabels[record.status]}{grade && ` · ${grade}`}</span>}
                        <span className="academic-course__footer"><span>{course.credits === null ? 'SCT no informados' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(course.credits)} SCT`}</span><CaretRight size={13} aria-hidden="true" /></span>
                      </button></li>;
                    })}</ul>
                  </section>;
                })}
              </div>
            </div>
            <footer className="academic-catalog-note"><Info size={16} aria-hidden="true" /><p>Prerrequisitos pendientes de interpretación. La ausencia de flechas no confirma ausencia de requisitos.</p></footer>
          </>}
        </div>
      </div>
    </div>
    {detail !== null && plan && !error && <CatalogDetails key={detail.code} course={detail} plan={plan} progress={!progress.error ? courseProgress.get(detail.code) : undefined} student={matchingProgress?.student} onClose={() => setDetail(null)} />}
  </main>;
}
