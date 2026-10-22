import { Link } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CurrencyDollarIcon } from '@phosphor-icons/react/dist/csr/CurrencyDollar';
import { ScanIcon } from '@phosphor-icons/react/dist/csr/Scan';
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react/dist/csr/ShoppingCartSimple';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseSummary } from '../../purchases/api/purchases.js';
import { usePurchaseCapabilities } from '../../purchases/model/capabilities.js';
import { SheetsSyncStatus } from '../../purchases/components/SheetsSyncStatus.js';
import { amountLabel, dateLabel } from '../../purchases/model/fields.js';

const sourceLabels = { manual: 'Ingreso manual', image_capture: 'Desde captura', contract_example: 'Ejemplo de demostración' };
const registrationDate = new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' });
export function Home() {
  const { secondReviewEnabled } = usePurchaseCapabilities();
  const query = useQuery({ queryKey: ['purchases', 'summary'], queryFn: ({ signal }) => getPurchaseSummary(signal), refetchOnMount: 'always' });
  const data = query.isError ? undefined : query.data?.data, overview = data?.overview;
  const maximum = overview?.registrationDays.reduce((max, day) => Math.max(max, day.count), 1) ?? 1;
  return <section className="admin-home">
    <div className="admin-home-heading"><div><p className="admin-section-label">Cenit · Espacio administrativo</p><h1>Inicio</h1><p className="admin-intro">Accede a tus módulos y consulta su actividad reciente.</p></div></div>
    <nav className="admin-modules" aria-label="Módulos de Cenit">
      <Link to="/administracion/compras"><span className="admin-module-icon"><ShoppingCartSimpleIcon size={24} aria-hidden="true" /></span><div><strong>Compras</strong><p>Consulta y registra copias revisadas.</p></div><ArrowUpRightIcon size={18} aria-hidden="true" /></Link>
      <Link to="/administracion/personal"><span className="admin-module-icon"><UsersIcon size={24} aria-hidden="true" /></span><div><strong>Personal</strong><span className="admin-module-status">En preparación</span></div><ArrowUpRightIcon size={18} aria-hidden="true" /></Link>
      <Link to="/administracion/bienes"><span className="admin-module-icon"><PackageIcon size={24} aria-hidden="true" /></span><div><strong>Bienes</strong><span className="admin-module-status">En preparación</span></div><ArrowUpRightIcon size={18} aria-hidden="true" /></Link>
    </nav>
    <div className="dashboard-section-heading dashboard-module-heading"><div><p className="admin-section-label">Compras</p><h2>Actividad del módulo</h2></div><Link className="admin-button" to="/administracion/compras">Abrir Compras<ArrowUpRightIcon size={16} aria-hidden="true" /></Link></div>
    {query.isPending ? <div className="dashboard-skeleton" role="status"><span>Cargando resumen…</span><i /><i /><i /><i /></div> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button className="admin-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      <dl className="dashboard-kpis" aria-label="Resumen de compras">
        <div><dt><FilesIcon size={19} aria-hidden="true" />Compras registradas</dt><dd>{data.requests}</dd><dd className="dashboard-kpi-detail">Registro histórico completo</dd></div>
        <div><dt><CurrencyDollarIcon size={19} aria-hidden="true" />Monto documental registrado</dt><dd>{overview ? amountLabel(overview.documentTotal) : '—'}</dd><dd className="dashboard-kpi-detail">Total de documentos · CLP</dd></div>
        <div><dt><CalendarBlankIcon size={19} aria-hidden="true" />Registradas este mes</dt><dd>{overview?.registeredThisMonth ?? '—'}</dd><dd className="dashboard-kpi-detail">Según incorporación a Cenit</dd></div>
        <div><dt><ScanIcon size={19} aria-hidden="true" />Desde captura</dt><dd>{overview?.sourceCounts.image_capture ?? '—'}</dd><dd className="dashboard-kpi-detail">{overview ? `${overview.sourceCounts.manual} manuales · ${overview.sourceCounts.contract_example} ejemplos` : 'Procedencia de los registros'}</dd></div>
      </dl>
      {overview && <div className="dashboard-grid">
        <section className="dashboard-activity" aria-labelledby="activity-title"><div className="dashboard-section-heading"><div><p className="admin-section-label">Últimos 30 días</p><h2 id="activity-title">Actividad de registro</h2></div><span>{overview.registrationDays.reduce((sum, day) => sum + day.count, 0)} incorporaciones</span></div>
          <ul className="dashboard-bars" aria-label="Compras incorporadas por día">{overview.registrationDays.map(day => <li key={day.date} title={`${dateLabel(day.date)}: ${day.count}`}><span className="purchase-sr-only">{dateLabel(day.date)}: {day.count} {day.count === 1 ? 'compra' : 'compras'}</span><span className="dashboard-bar" aria-hidden="true" style={{ height: `${day.count / maximum * 100}%` }} /></li>)}</ul>
          <div className="dashboard-axis" aria-hidden="true"><span>{overview.registrationDays[0] && dateLabel(overview.registrationDays[0].date)}</span><span>{overview.registrationDays.at(-1) && dateLabel(overview.registrationDays.at(-1)!.date)}</span></div>
          <p className="dashboard-caption">Fecha de incorporación a Cenit · Hora de Santiago</p>
        </section>
        <section className="dashboard-recent" aria-labelledby="recent-title"><div className="dashboard-section-heading"><h2 id="recent-title">Últimos registros</h2><Link to="/administracion/compras">Ver registros<ArrowUpRightIcon size={16} aria-hidden="true" /></Link></div>
          {overview.recentRecords.length ? <ul>{overview.recentRecords.map(record => <li key={record.id}><Link to={`/administracion/compras/${record.id}`}><div><strong>{record.requestNumber}</strong><span>{record.description}</span><small>{sourceLabels[record.source]} · {registrationDate.format(new Date(record.createdAt))}</small></div><b>{amountLabel(record.totalAmount)}</b></Link></li>)}</ul>
            : <div className="dashboard-empty"><FilesIcon size={32} aria-hidden="true" /><h3>Aún no hay compras registradas</h3><p>Los registros del módulo aparecerán aquí.</p><Link className="admin-button" to="/administracion/compras">Ir a Compras</Link></div>}
        </section>
      </div>}
      {secondReviewEnabled && <section className="dashboard-review" aria-label="Segunda revisión"><div><h2>Revisión de datos en Cenit</h2><p>{data.pending} {data.pending === 1 ? 'registro por revisar' : 'registros por revisar'}</p></div><strong>{amountLabel(data.pendingAmount)} <small>documentales por revisar</small></strong><Link className="admin-button" to="/administracion/compras">Ver revisión</Link></section>}
      <SheetsSyncStatus />
    </>}
  </section>;
}
