import { Link } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FilesIcon } from '@phosphor-icons/react/dist/csr/Files';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { CurrencyDollarIcon } from '@phosphor-icons/react/dist/csr/CurrencyDollar';
import { dashboardDemo } from '../model/dashboard-demo.js';

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export function Home() {
  const { requests, pending, pendingAmount, days } = dashboardDemo;
  const maximum = Math.max(...days.map(day => day.count), 1);
  return <section className="admin-home">
    <div className="admin-home-heading">
      <div><p className="admin-section-label">Vista general</p><h1>Administración</h1><p className="admin-intro">Seguimiento de solicitudes de compra</p></div>
      <Link className="admin-button" to="/administracion/compras">Ver solicitudes<ArrowUpRightIcon size={15} aria-hidden="true" /></Link>
    </div>
    <p className="dashboard-period">5 al 9 de octubre de 2026</p>
    <dl className="dashboard-kpis" aria-label="Resumen de solicitudes">
      <div><dt><FilesIcon size={17} aria-hidden="true" />Solicitudes</dt><dd>{requests.length}</dd><dd className="dashboard-kpi-detail">En el período</dd></div>
      <div><dt><ClockIcon size={17} aria-hidden="true" />Pendientes de aprobación</dt><dd>{pending.length}</dd><dd className="dashboard-kpi-detail">Responsable: Luis Lanas</dd></div>
      <div><dt><CurrencyDollarIcon size={17} aria-hidden="true" />Monto pendiente</dt><dd>{currency.format(pendingAmount)}</dd><dd className="dashboard-kpi-detail">Total de solicitudes · CLP</dd></div>
    </dl>
    <section className="dashboard-chart" aria-labelledby="pending-chart-title">
      <div><p className="admin-section-label">Actividad del período</p><h2 id="pending-chart-title">Pendientes por fecha de envío</h2><p>Solicitudes que esperan aprobación.</p></div>
      <ul aria-label="Cantidad de solicitudes pendientes por día">
        {days.map(day => <li key={day.date}>
          <span className="dashboard-chart-date">{day.label}</span>
          <div className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${day.count / maximum * 100}%` }} /></div>
          <span className="dashboard-chart-count">{day.count} <span className="dashboard-chart-unit">{day.count === 1 ? 'solicitud' : 'solicitudes'}</span></span>
        </li>)}
      </ul>
    </section>
  </section>;
}
