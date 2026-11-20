import { Link } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { useQuery } from '@tanstack/react-query';
import type { PurchaseSummaryResponse } from '@cenit/contracts/purchases';
import { getPurchaseSummary } from '../../purchases/api/purchases.js';
import { ExportExcel } from '../../purchases/components/ExportExcel.js';
import { PurchaseCapabilitiesProvider, usePurchaseCapabilities } from '../../purchases/model/capabilities.js';
import { SheetsSyncStatus } from '../../purchases/components/SheetsSyncStatus.js';
import { amountLabel } from '../../purchases/model/fields.js';
import { periodRange } from '../../purchases/model/list.js';
import { displayInstantDate } from '../../../shared/lib/dates.js';
import { Skeleton } from '../../../shared/components/Skeleton.js';
import { MonthlyChart } from '../components/MonthlyChart.js';
import { DocumentTypeChart } from '../components/DocumentTypeChart.js';
import '../home.css';

const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });

function DashboardSkeleton() {
  return <div className="dashboard-purchases dashboard-loading" role="status">
    <span className="cenit-loading-label">Cargando resumen…</span>
    <div className="dashboard-kpis" aria-hidden="true">{[0, 1, 2].map(index => <div key={index}>
      <Skeleton width="7rem" height="19.5px" /><span className="dashboard-loading__value"><Skeleton width="55%" height="1em" /></span><Skeleton width="8rem" height="18px" />
    </div>)}</div>
    <div className="dashboard-grid" aria-hidden="true">
      <div className="dashboard-card dashboard-monthly"><div className="dashboard-section-heading"><Skeleton width="8rem" height="22px" /></div>
        <div className="dashboard-monthly__bars dashboard-loading__bars">{[30, 52, 40, 65, 49, 76, 61, 53, 68, 49, 36, 57].map((height, index) => <Skeleton key={index} height={`${height}%`} />)}</div>
      </div>
      <div className="dashboard-card dashboard-types"><div className="dashboard-section-heading"><Skeleton width="10rem" height="22px" /></div><div className="dashboard-types-body">
        <div className="dashboard-donut dashboard-loading__donut" /><div className="dashboard-legend"><Skeleton /><Skeleton width="74%" /><Skeleton width="88%" /></div>
      </div></div>
      <div className="dashboard-card dashboard-recent"><div className="dashboard-section-heading"><Skeleton width="9rem" height="22px" /></div>
        <ul>{Array.from({ length: 8 }, (_, index) => <li key={index}><div className="dashboard-loading__recent"><Skeleton width="74%" /><Skeleton width="48%" /></div></li>)}</ul>
      </div>
    </div>
  </div>;
}

function DashboardIntegrations({ data }: { data: PurchaseSummaryResponse['data'] }) {
  const { secondReviewEnabled } = usePurchaseCapabilities();
  return <>
    {secondReviewEnabled && <section className="dashboard-review" aria-label="Segunda revisión"><h2 className="purchase-sr-only">Revisión de datos en Cenit</h2><p>{data.pending} {data.pending === 1 ? 'registro por revisar' : 'registros por revisar'}</p><strong title="Monto documental por revisar">{amountLabel(data.pendingAmount)} <small className="purchase-sr-only">documentales por revisar</small></strong><Link to="/administracion/compras">Ver revisión</Link></section>}
    <SheetsSyncStatus />
  </>;
}

export function Home() {
  const query = useQuery({ queryKey: ['purchases', 'summary'], queryFn: ({ signal }) => getPurchaseSummary(signal), refetchOnMount: 'always' });
  const data = query.isError ? undefined : query.data?.data, overview = data?.overview;
  const year = overview?.registrationMonth.slice(0, 4);
  const month = overview && monthName.format(new Date(`${overview.registrationMonth}-01T12:00:00Z`));
  const monthNumber = overview?.registrationMonth.slice(5, 7);
  const exportOptions = year ? [
    { id: 'year', label: `Todo ${year}`, detail: `Compras con fecha de envío entre enero y diciembre de ${year}.`, filters: periodRange(year) },
    ...(month && monthNumber ? [{ id: 'month', label: `Sólo ${month}`, detail: `Compras con fecha de envío en ${month} de ${year}.`, filters: periodRange(year, monthNumber) }] : []),
    { id: 'all', label: 'Todo el historial', detail: 'Todas las compras registradas en Cenit, sin filtros.', filters: {} },
  ] : [];
  const types = overview?.documentTypes ?? [], typeTotal = types.reduce((sum, type) => sum + type.count, 0);
  const integrations = data && <PurchaseCapabilitiesProvider fallback={null}><DashboardIntegrations data={data} /></PurchaseCapabilitiesProvider>;
  return <section className="admin-home">
    <header className="admin-home-heading"><div><h1>Inicio</h1><p className="admin-intro">Un vistazo a la actividad administrativa.</p></div>
      <div className="admin-home-actions"><ExportExcel options={exportOptions} disabled={!year} />
        <Link className="cenit-button cenit-button--primary" to="/administracion/compras/captura"><UploadSimpleIcon size={18} aria-hidden="true" />Subir captura</Link>
      </div>
    </header>
    {query.isPending ? <DashboardSkeleton /> : <div className="dashboard-purchases">
    {query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button className="cenit-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      <dl className="dashboard-kpis" aria-label="Resumen de compras">
        <div><dt>Compras en {year ?? 'el año'}</dt><dd>{overview?.registeredThisYear ?? '—'}</dd><dd className="dashboard-kpi-detail">Según fecha de envío</dd></div>
        <div><dt>Monto en {year ?? 'el año'}</dt><dd title={overview?.documentTotalThisYear ? amountLabel(overview.documentTotalThisYear) : undefined}>{overview?.documentTotalThisYear ? amountLabel(overview.documentTotalThisYear) : '—'}</dd><dd className="dashboard-kpi-detail">CLP · según fecha de envío</dd></div>
        <div><dt>Monto en {month ?? 'el mes'}</dt><dd title={overview ? amountLabel(overview.documentTotalThisMonth) : undefined}>{overview ? amountLabel(overview.documentTotalThisMonth) : '—'}</dd><dd className="dashboard-kpi-detail">{overview ? `${overview.registeredThisMonth} ${overview.registeredThisMonth === 1 ? 'compra' : 'compras'}` : 'Mes en curso'}</dd></div>
      </dl>
      {overview && <div className="dashboard-grid">
        <section className="dashboard-card dashboard-months" aria-labelledby="months-title"><div className="dashboard-section-heading"><h2 id="months-title">Monto por mes</h2><span>{year} · según fecha de envío</span></div>
          {overview.monthlyTotals?.length ? <MonthlyChart months={overview.monthlyTotals} current={overview.registrationMonth} /> : <p className="dashboard-muted">Sin datos mensuales disponibles.</p>}
        </section>
        <section className="dashboard-card dashboard-types" aria-labelledby="types-title"><div className="dashboard-section-heading"><h2 id="types-title">Por tipo de documento</h2><span>{year}</span></div>
          {typeTotal ? <DocumentTypeChart types={types} /> : <p className="dashboard-muted">Aún no hay compras con fecha de envío este año.</p>}
          {integrations}
        </section>
        <section className="dashboard-card dashboard-recent" aria-labelledby="recent-title"><div className="dashboard-section-heading"><h2 id="recent-title">Últimos registros</h2><Link to="/administracion/compras">Ver registros<ArrowUpRightIcon size={16} aria-hidden="true" /></Link></div>
          {overview.recentRecords.length ? <ul>{overview.recentRecords.map(record => <li key={record.id}><Link to={`/administracion/compras/${record.id}`}><div><strong>{record.description}</strong><span>{record.requestNumber}{record.source === 'contract_example' && ' · Ejemplo de demostración'}</span></div><div className="dashboard-recent-amount"><b title={amountLabel(record.totalAmount)}>{amountLabel(record.totalAmount)}</b><small><span className="purchase-sr-only">Incorporado el </span><time dateTime={record.createdAt}>{displayInstantDate(record.createdAt)}</time></small></div></Link></li>)}</ul>
            : <div className="cenit-empty cenit-empty--compact"><span className="cenit-empty__icon"><FilesIcon size={26} aria-hidden="true" /></span><h3>Aún no hay compras registradas</h3><p>Sube una captura para registrar la primera.</p></div>}
        </section>
      </div>}
      {!overview && integrations}
    </>}
    </div>}
  </section>;
}
