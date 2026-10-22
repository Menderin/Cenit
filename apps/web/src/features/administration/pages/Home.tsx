import { Link } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CurrencyDollarIcon } from '@phosphor-icons/react/dist/csr/CurrencyDollar';
import { ScanIcon } from '@phosphor-icons/react/dist/csr/Scan';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseSummary } from '../../purchases/api/purchases.js';
import { usePurchaseCapabilities } from '../../purchases/model/capabilities.js';
import { SheetsSyncStatus } from '../../purchases/components/SheetsSyncStatus.js';
import { amountLabel, dateLabel } from '../../purchases/model/fields.js';
import '../home.css';

const sourceLabels = { manual: 'Ingreso manual', image_capture: 'Desde captura', contract_example: 'Ejemplo de demostración' };
const registrationDate = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' });
const registrationMonth = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export function Home() {
  const { secondReviewEnabled } = usePurchaseCapabilities();
  const query = useQuery({ queryKey: ['purchases', 'summary'], queryFn: ({ signal }) => getPurchaseSummary(signal), refetchOnMount: 'always' });
  const data = query.isError ? undefined : query.data?.data, overview = data?.overview;
  const maximum = overview?.registrationDays.reduce((max, day) => Math.max(max, day.count), 1) ?? 1;
  const month = overview && registrationMonth.format(new Date(`${overview.registrationMonth}-01T12:00:00Z`));
  const review = data && secondReviewEnabled && <section className="dashboard-review" aria-label="Segunda revisión"><h2 className="purchase-sr-only">Revisión de datos en Cenit</h2><p>{data.pending} {data.pending === 1 ? 'registro por revisar' : 'registros por revisar'}</p><strong title="Monto documental por revisar">{amountLabel(data.pendingAmount)} <small className="purchase-sr-only">documentales por revisar</small></strong><Link to="/administracion/compras">Ver revisión</Link></section>;
  return <section className="admin-home">
    <header className="admin-home-heading"><h1>Inicio</h1><p className="admin-intro">Un vistazo a la actividad administrativa.</p></header>
    <div className="dashboard-section-heading dashboard-module-heading"><h2>Compras</h2><Link className="admin-button" to="/administracion/compras">Abrir Compras<ArrowUpRightIcon size={16} aria-hidden="true" /></Link></div>
    <div className="dashboard-purchases">
    {query.isPending ? <div className="dashboard-skeleton" role="status"><span>Cargando resumen…</span><i /><i /><i /><i /></div> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button className="admin-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      <dl className="dashboard-kpis" aria-label="Resumen de compras">
        <div><dt><FilesIcon size={19} aria-hidden="true" />Compras este año</dt><dd>{overview?.registeredThisYear ?? '—'}</dd><dd className="dashboard-kpi-detail">{overview ? `Enero a diciembre de ${overview.registrationMonth.slice(0, 4)}` : 'Según incorporación a Cenit'}</dd></div>
        <div><dt><CalendarBlankIcon size={19} aria-hidden="true" />Compras este mes</dt><dd>{overview?.registeredThisMonth ?? '—'}</dd><dd className="dashboard-kpi-detail">{month ?? 'Según incorporación a Cenit'}</dd></div>
        <div><dt><CurrencyDollarIcon size={19} aria-hidden="true" />Monto registrado este mes</dt><dd>{overview ? amountLabel(overview.documentTotalThisMonth) : '—'}</dd><dd className="dashboard-kpi-detail">{month ? `${month} · CLP` : 'Total de documentos · CLP'}</dd></div>
        <div><dt><ScanIcon size={19} aria-hidden="true" />Desde captura</dt><dd>{overview?.sourceCounts.image_capture ?? '—'}</dd><dd className="dashboard-kpi-detail">Procedencia · Todos los registros</dd></div>
      </dl>
      {overview && <div className="dashboard-grid">
        <section className="dashboard-activity" aria-labelledby="activity-title"><div className="dashboard-section-heading"><h2 id="activity-title">Actividad de registro</h2><span>{overview.registrationDays.reduce((sum, day) => sum + day.count, 0)} incorporaciones · 30 días</span></div>
          <ul className="dashboard-bars" aria-label="Compras incorporadas por día">{overview.registrationDays.map(day => <li key={day.date} title={`${dateLabel(day.date)}: ${day.count}`}><span className="purchase-sr-only">{dateLabel(day.date)}: {day.count} {day.count === 1 ? 'compra' : 'compras'}</span><span className="dashboard-bar" aria-hidden="true" style={{ height: `${day.count / maximum * 100}%` }} /></li>)}</ul>
          <div className="dashboard-axis" aria-hidden="true"><span>{overview.registrationDays[0] && dateLabel(overview.registrationDays[0].date)}</span><span>{overview.registrationDays.at(-1) && dateLabel(overview.registrationDays.at(-1)!.date)}</span></div>
          <p className="purchase-sr-only">Fecha de incorporación a Cenit · Hora de Santiago</p>
          {review}
          <SheetsSyncStatus />
        </section>
        <section className="dashboard-recent" aria-labelledby="recent-title"><div className="dashboard-section-heading"><h2 id="recent-title">Últimos registros</h2><Link to="/administracion/compras">Ver registros<ArrowUpRightIcon size={16} aria-hidden="true" /></Link></div>
          {overview.recentRecords.length ? <ul>{overview.recentRecords.map(record => <li key={record.id}><Link to={`/administracion/compras/${record.id}`}><div><strong>{record.requestNumber}</strong><span title={record.description}>{record.description}</span></div><div className="dashboard-recent-amount"><b>{amountLabel(record.totalAmount)}</b><small title={sourceLabels[record.source]}>{registrationDate.format(new Date(record.createdAt)).replaceAll('-', '/')}</small><span className="purchase-sr-only">{sourceLabels[record.source]}</span></div></Link></li>)}</ul>
            : <div className="dashboard-empty"><FilesIcon size={32} aria-hidden="true" /><h3>Aún no hay compras registradas</h3><p>Los registros del módulo aparecerán aquí.</p><Link className="admin-button" to="/administracion/compras">Ir a Compras</Link></div>}
        </section>
      </div>}
      {!overview && <>{review}<SheetsSyncStatus /></>}
    </>}
    </div>
  </section>;
}
