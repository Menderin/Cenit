import { Link, useSearchParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getPurchaseProject, getPurchaseSummary, listPurchaseProjects } from '../../purchases/api/purchases.js';
import { Select } from '../../../shared/components/Select.js';
import { Skeleton } from '../../../shared/components/Skeleton.js';
import { displayInstantDate } from '../../../shared/lib/dates.js';
import { GeneralOverview } from '../components/GeneralOverview.js';
import { ProjectOverview, projectPurchasesPath } from '../components/ProjectOverview.js';
import { ProjectPicker } from '../components/ProjectPicker.js';
import '../home.css';

const santiagoMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

function DashboardSkeleton() {
  return <div className="dashboard-purchases home-loading" role="status">
    <span className="cenit-loading-label">Cargando resumen…</span>
    <div className="home-layout" aria-hidden="true">
      <div className="home-main">
        <div className="home-spend"><div className="home-figures"><div className="home-figure home-figure--main"><Skeleton width="8rem" height="20px" /><Skeleton width="16rem" height="44px" /></div><div className="home-figure"><Skeleton width="10rem" height="20px" /><Skeleton width="12rem" height="32px" /></div></div>
          <div className="home-loading__bars">{[30, 52, 40, 65, 49, 76, 61, 53, 68, 49, 36, 57].map((height, index) => <Skeleton key={index} height={`${height}%`} />)}</div></div>
        <div className="home-projects"><Skeleton width="12rem" height="24px" /><div className="home-loading-lines">{[92, 70, 54, 38].map(width => <Skeleton key={width} width={`${width}%`} height="18px" />)}</div></div>
      </div>
      <div className="home-rail">{[0, 1].map(index => <div key={index} className="home-rail__section"><Skeleton width="8rem" height="22px" /><div className="home-loading-lines">{[84, 66, 72].map(width => <Skeleton key={width} width={`${width}%`} height="16px" />)}</div></div>)}</div>
    </div>
  </div>;
}

/** Inicio administrativo. Sin filtro muestra el resumen general; con `?project=` se transforma en el resumen de ese proyecto. */
export function Home() {
  const [params, setParams] = useSearchParams();
  const project = params.get('project')?.trim() ?? '';
  const requestedYear = /^\d{4}$/.test(params.get('year') ?? '') ? params.get('year')! : undefined;
  const summary = useQuery({ queryKey: ['purchases', 'summary', requestedYear ?? 'current'], queryFn: ({ signal }) => getPurchaseSummary(signal, requestedYear),
    refetchOnMount: 'always', placeholderData: keepPreviousData, enabled: !project });
  const detail = useQuery({ queryKey: ['purchases', 'project', project, requestedYear ?? 'current'], queryFn: ({ signal }) => getPurchaseProject(project, signal, requestedYear),
    refetchOnMount: 'always', placeholderData: keepPreviousData, enabled: !!project });
  const active = project ? detail : summary;
  // While another project loads, its previous neighbour is never shown under the new title.
  const overview = summary.isError ? undefined : summary.data?.data.overview, projectData = !detail.isError && detail.data?.data.code === project ? detail.data.data : undefined;
  const loading = project ? !projectData && !detail.isError : summary.isPending;
  const currentMonth = overview?.registrationMonth ?? santiagoMonth();
  const year = requestedYear ?? (project ? projectData?.year : overview?.year ?? overview?.registrationMonth.slice(0, 4)) ?? currentMonth.slice(0, 4);
  const projects = useQuery({ queryKey: ['purchases', 'projects', year], queryFn: ({ signal }) => listPurchaseProjects(signal, year), placeholderData: keepPreviousData });
  const years = [...new Set([Number(year), Number(currentMonth.slice(0, 4)), ...(project ? projectData?.availableYears ?? [] : overview?.availableYears ?? [])])].filter(Boolean).sort((a, b) => b - a);
  const navigate = (next: { project?: string; year?: string }) => setParams(previous => {
    const values = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(next)) if (value) values.set(key, value); else values.delete(key);
    return values;
  });
  const selectProject = (code: string) => navigate({ project: code });
  // El resumen de un proyecto se ve como otra pantalla: la flecha devuelve al Inicio general con el mismo año.
  const general = new URLSearchParams(params);
  general.delete('project');
  const latest = project ? undefined : overview?.recentRecords[0];
  const projectName = projectData?.name ?? projects.data?.data.projects.find(option => option.code === project)?.name ?? null;
  return <section className={`admin-home${project ? ' admin-home--project' : ''}`}>
    <header className="admin-home-heading">
      <div className="admin-home-title">{project ? <>
        <div className="admin-home-titlebar"><Link className="home-chip home-chip--back" to={`/administracion${general.size ? `?${general}` : ''}`} aria-label="Volver a Inicio" title="Volver al resumen de todos los proyectos"><ArrowLeftIcon size={16} aria-hidden="true" />Inicio</Link>
          <h1 title={projectName ?? undefined}>{projectName ?? (detail.isPending ? <Skeleton width="22rem" height="30px" /> : `Proyecto ${project}`)}</h1></div>
        {!!projectData?.units.length && <ul className="admin-home-chips" aria-label="Unidades del proyecto">
          {projectData.units.map(unit => { const name = unit.name ?? 'Unidad sin nombre en el catálogo';
            return <li key={unit.code ?? 'none'} title={`${unit.code ?? 'Sin código'} ${name}`}><b>{unit.code ?? 'Sin código'}</b><span>{name}</span></li>; })}</ul>}
      </> : <><h1>Inicio</h1><div className="admin-home-meta">{latest && <span>Último registro el {displayInstantDate(latest.createdAt)}</span>}
        <Link className="home-chip" to="/administracion/compras"><FilesIcon size={16} aria-hidden="true" />Ver registros<ArrowRightIcon size={14} aria-hidden="true" /></Link></div></>}</div>
      <div className="admin-home-actions">
        <div className="admin-home-year"><Select className="cenit-button admin-home-select" label="Año" value={year} onValueChange={value => navigate({ year: value })}
          options={years.map(value => ({ value: String(value).padStart(4, '0'), label: String(value) }))} /></div>
        <ProjectPicker value={project} year={year} projects={projects.data?.data.projects} loading={projects.isPending} error={projects.isError} onChange={selectProject} />
        {project ? <Link className="cenit-button cenit-button--primary" to={projectPurchasesPath(project, year)}>Ver compras<ArrowRightIcon size={17} aria-hidden="true" /></Link>
          : <Link className="cenit-button cenit-button--primary" to="/administracion/compras/captura"><UploadSimpleIcon size={18} aria-hidden="true" />Subir captura</Link>}
      </div>
    </header>
    {loading ? <DashboardSkeleton /> : <div className="dashboard-purchases" aria-busy={active.isFetching}>
      {active.isError ? <div className="purchase-state" role="alert"><p>{active.error.message}</p><button className="cenit-button" onClick={() => { void active.refetch(); }}>Reintentar</button>
        {project && <button className="cenit-button" onClick={() => navigate({ project: '' })}>Ver todos los proyectos</button>}</div>
        : project ? projectData && <ProjectOverview key={project} data={projectData} currentMonth={currentMonth} onYear={value => navigate({ year: value })} onClear={() => navigate({ project: '' })} />
        : summary.data && <GeneralOverview data={summary.data.data} onProject={selectProject} />}
    </div>}
  </section>;
}
