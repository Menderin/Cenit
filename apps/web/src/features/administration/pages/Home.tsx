import { Link } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { CurrencyDollarIcon } from '@phosphor-icons/react/dist/csr/CurrencyDollar';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseSummary } from '../../purchases/api/purchases.js';
import { usePurchaseCapabilities } from '../../purchases/model/capabilities.js';
import { SheetsSyncStatus } from '../../purchases/components/SheetsSyncStatus.js';
import { amountLabel, dateLabel } from '../../purchases/model/fields.js';

export function Home() {
  const { secondReviewEnabled } = usePurchaseCapabilities();
  const query = useQuery({ queryKey: ['purchases', 'summary'], queryFn: ({ signal }) => getPurchaseSummary(signal), refetchOnMount: 'always' });
  const data = query.isError ? undefined : query.data?.data;
  const maximum = data?.days.reduce((max, day) => Math.max(max, day.count), 1) ?? 1;
  return <section className="admin-home">
    <div className="admin-home-heading">
      <div><p className="admin-section-label">Vista general</p><h1>Administración</h1><p className="admin-intro">Registro de compras aprobadas</p></div>
      <Link className="admin-button" to="/administracion/compras">Ver registros<ArrowUpRightIcon size={15} aria-hidden="true" /></Link>
    </div>
    <p className="dashboard-period">Copias registradas en Cenit · Todas las fechas</p>
    {query.isPending ? <p role="status">Cargando resumen…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button className="admin-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
    <dl className="dashboard-kpis" aria-label="Resumen de solicitudes">
      <div><dt><FilesIcon size={17} aria-hidden="true" />Registros guardados</dt><dd>{data.requests}</dd><dd className="dashboard-kpi-detail">Total registrado</dd></div>
      {secondReviewEnabled && <><div><dt><ClockIcon size={17} aria-hidden="true" />Pendientes de revisión</dt><dd>{data.pending}</dd><dd className="dashboard-kpi-detail">Revisión de datos en Cenit</dd></div>
      <div><dt><CurrencyDollarIcon size={17} aria-hidden="true" />Monto por revisar en Cenit</dt><dd>{amountLabel(data.pendingAmount)}</dd><dd className="dashboard-kpi-detail">Total documental por revisar · CLP</dd></div></>}
    </dl>
    {secondReviewEnabled && <section className="dashboard-chart" aria-labelledby="pending-chart-title">
      <div><p className="admin-section-label">Revisión de datos</p><h2 id="pending-chart-title">Pendientes por fecha de envío</h2><p>Solicitudes que esperan revisión de sus datos.</p></div>
      <div>{!data.requests ? <p role="status">Aún no hay solicitudes registradas.</p> : <>
      {!data.pending && <p role="status">No hay solicitudes pendientes de revisión.</p>}
      <ul aria-label="Cantidad de solicitudes pendientes por día">
        {data.days.map(day => <li key={day.date}>
          <span className="dashboard-chart-date">{dateLabel(day.date)}</span>
          <div className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${day.count / maximum * 100}%` }} /></div>
          <span className="dashboard-chart-count">{day.count} <span className="dashboard-chart-unit">{day.count === 1 ? 'solicitud' : 'solicitudes'}</span></span>
        </li>)}
      </ul>
      </>}</div>
    </section>}
    {!secondReviewEnabled && !data.requests && <p role="status">Aún no hay compras registradas.</p>}
    <SheetsSyncStatus />
    </>}
  </section>;
}
