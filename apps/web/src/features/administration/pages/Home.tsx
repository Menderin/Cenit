import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { CurrencyDollarIcon } from '@phosphor-icons/react/dist/csr/CurrencyDollar';
import { getPurchaseSummary } from '../../purchases/api/purchases.js';
import { amountLabel, dateLabel } from '../../purchases/model/fields.js';

export function Home() {
  const query = useQuery({ queryKey: ['purchases', 'summary'], queryFn: ({ signal }) => getPurchaseSummary(signal), refetchOnMount: 'always' });
  const summary = query.data?.data;
  const days = summary?.pendingByDate.map(day => ({ ...day, label: dateLabel(day.date) })) ?? [];
  const maximum = Math.max(...days.map(day => day.count), 1);
  return <section className="admin-home">
    <div className="admin-home-heading">
      <div><p className="admin-section-label">Vista general</p><h1>Administración</h1><p className="admin-intro">Seguimiento de solicitudes de compra</p></div>
      <Link className="admin-button" to="/administracion/compras">Ver solicitudes<ArrowUpRightIcon size={15} aria-hidden="true" /></Link>
    </div>
    <p className="dashboard-period">Resumen de todas las solicitudes registradas</p>
    {query.isPending ? <p role="status">Cargando resumen…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button className="admin-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : summary && <>
    <dl className="dashboard-kpis" aria-label="Resumen de solicitudes">
      <div><dt><FilesIcon size={17} aria-hidden="true" />Solicitudes</dt><dd>{summary.totalCount}</dd><dd className="dashboard-kpi-detail">Registradas en Cenit</dd></div>
      <div><dt><ClockIcon size={17} aria-hidden="true" />Pendientes de revisión</dt><dd>{summary.pendingCount}</dd><dd className="dashboard-kpi-detail">Revisión de datos en Cenit</dd></div>
      <div><dt><CurrencyDollarIcon size={17} aria-hidden="true" />Monto pendiente</dt><dd>{amountLabel(summary.pendingAmount)}</dd><dd className="dashboard-kpi-detail">Total de solicitudes · CLP</dd></div>
    </dl>
    <section className="dashboard-chart" aria-labelledby="pending-chart-title">
      <div><p className="admin-section-label">Solicitudes registradas</p><h2 id="pending-chart-title">Pendientes por fecha de envío</h2><p>Solicitudes que esperan revisión de sus datos.</p></div>
      {days.length ? <ul aria-label="Cantidad de solicitudes pendientes por día">
        {days.map(day => <li key={day.date}>
          <span className="dashboard-chart-date">{day.label}</span>
          <div className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${day.count / maximum * 100}%` }} /></div>
          <span className="dashboard-chart-count">{day.count} <span className="dashboard-chart-unit">{day.count === 1 ? 'solicitud' : 'solicitudes'}</span></span>
        </li>)}
      </ul> : <p>No hay solicitudes pendientes de revisión.</p>}
    </section>
    </>}
  </section>;
}
