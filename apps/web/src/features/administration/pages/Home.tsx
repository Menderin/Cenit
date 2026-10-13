import { Link } from 'react-router';
import { dashboardDemo } from '../model/dashboard-demo.js';

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export function Home() {
  const { requests, pending, pendingAmount, days } = dashboardDemo;
  const maximum = Math.max(...days.map(day => day.count), 1);
  return <section className="admin-home">
    <div className="admin-home-heading">
      <div><h1>Administración</h1><p className="admin-intro">Resumen del sistema de compra</p></div>
      <Link className="admin-primary" to="/administracion/compras">Ir al sistema de compra</Link>
    </div>
    <aside className="dashboard-demo-note" aria-label="Datos ilustrativos">
      <strong>Prototipo con datos ficticios</strong>
      <p>Indicadores propuestos para validar con el cliente. No hay conexión con Oracle. Las aprobaciones se realizan en Oracle.</p>
    </aside>
    <p className="dashboard-period">Muestra ilustrativa · 5 al 9 de octubre de 2026</p>
    <dl className="dashboard-kpis" aria-label="Indicadores de solicitudes ficticias">
      <div><dt>Solicitudes de la muestra</dt><dd>{requests.length}</dd><dd className="dashboard-kpi-detail">Registros ficticios del período</dd></div>
      <div className="dashboard-kpi-pending"><dt>Pendientes de Luis Lanas</dt><dd>{pending.length}</dd><dd className="dashboard-kpi-detail">Aprobación pendiente en Oracle</dd></div>
      <div><dt>Monto de solicitudes pendientes</dt><dd>{currency.format(pendingAmount)}</dd><dd className="dashboard-kpi-detail">CLP · No representa pagos realizados</dd></div>
    </dl>
    <section className="dashboard-chart" aria-labelledby="pending-chart-title">
      <div><h2 id="pending-chart-title">Pendientes por fecha de envío</h2><p>Solicitudes de la muestra que aún esperan la aprobación de Luis Lanas.</p></div>
      <ul aria-label="Cantidad de solicitudes pendientes por día">
        {days.map(day => <li key={day.date}>
          <span className="dashboard-chart-date">{day.label}</span>
          <div className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${day.count / maximum * 100}%` }} /></div>
          <span className="dashboard-chart-count">{day.count} <span className="dashboard-chart-unit">{day.count === 1 ? 'solicitud' : 'solicitudes'}</span></span>
        </li>)}
      </ul>
    </section>
    <p className="admin-home__note">La secuencia de aprobación mostrada en la captura sirve como referencia. El alcance del seguimiento, los estados y los indicadores siguen pendientes de validación con el cliente.</p>
  </section>;
}
