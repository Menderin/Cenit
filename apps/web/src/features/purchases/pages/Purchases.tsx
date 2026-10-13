import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { validatePurchaseListQuery, type PurchaseFilters, type ContractProblem } from '@cenit/contracts/purchases';
import { listPurchases } from '../api/purchases.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { dateLabel } from '../model/fields.js';
import '../records.css';

function RequestTable({ state, title, filters }: { state: 'pending' | 'reviewed'; title: string; filters: PurchaseFilters }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['purchases', 'list', state, filters, page], queryFn: ({ signal }) => listPurchases(state, page, signal, filters) });
  const data = query.data;
  return <section className="purchase-list" aria-label={title}>
    <h2>{title}</h2>
    {query.isPending ? <p role="status">Cargando solicitudes…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      <p>{data.pagination.total} {data.pagination.total === 1 ? 'registro' : 'registros'}</p>
      <p>Monto total de solicitudes coincidentes (CLP): <strong>{data.totals.documentTotal}</strong></p>
      <p className="purchase-table-hint">Desplaza la tabla horizontalmente si necesitas ver las columnas.</p>
      <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table>
        <caption className="purchase-sr-only">{title}</caption><thead><tr><th scope="col">Nº Solicitud</th><th scope="col">Fecha</th><th scope="col">Detalle</th><th scope="col">Tipo de documento</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{!data.data.length && <tr><td colSpan={5} className="purchase-empty">No hay solicitudes en esta página.</td></tr>}{data.data.map(record => <tr key={record.id}><th scope="row">{record.requestNumber}</th><td>{dateLabel(record.sentDate)}</td><td>{record.description}{record.source === 'contract_example' && <p className="purchase-origin-notice">Ejemplo ficticio sin extracción real ({record.exampleId})</p>}</td><td>{record.documentType ?? 'Sin dato'}</td><td className="purchase-row-actions">
          <Link to={`/administracion/compras/${record.id}`}>Ver detalles</Link>
          {state === 'pending' && <ValidateRecord id={record.id} version={record.version} />}
        </td></tr>)}</tbody>
      </table></div>
      <div className="purchase-pagination" aria-label={`Paginación: ${title}`}><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * 20 >= data.pagination.total} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
    </>}
  </section>;
}
export function Purchases() {
  const [inputs, setInputs] = useState({ q: '', dateFrom: '', dateTo: '', unitCode: '', projectCode: '' });
  const [filters, setFilters] = useState<PurchaseFilters>({});
  const [generation, setGeneration] = useState(0);
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const filterLabels = { q: 'Buscar por número, descripción o proveedor', dateFrom: 'Fecha de envío desde', dateTo: 'Fecha de envío hasta', unitCode: 'Código de unidad (ítem)', projectCode: 'Código de proyecto (ítem)' };
  function apply(next: PurchaseFilters) { setFilters(next); setGeneration(value => value + 1); setProblems([]); }
  return <section className="purchase-records"><div className="purchase-page-heading"><div><h1>Sistema de compra</h1><p>Copias conservadas en Cenit. La validación local no es una aprobación en Oracle.</p></div><Link className="admin-primary" to="/administracion/compras/nueva">Agregar solicitud manual</Link></div>
    <p><Link to="/administracion/compras/laboratorio">Abrir laboratorio de ejemplos de extracción</Link></p>
    <form className="purchase-filters" noValidate aria-label="Filtros de solicitudes" onSubmit={event => {
      event.preventDefault();
      const values = { ...inputs, q: inputs.q.trim() };
      const next = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')) as PurchaseFilters;
      const errors = validatePurchaseListQuery({ ...next, reviewStatus: 'pending', page: 1, pageSize: 20 });
      setProblems(errors); if (!errors.length) apply(next);
    }}>
      <p>Estos filtros se aplican a ambas tablas. Unidad y proyecto deben coincidir en el mismo ítem.</p>
      <div className="purchase-filter-grid">{Object.entries(inputs).map(([key, value]) => {
        const field = key as keyof typeof inputs, id = `purchase-filter-${key}`;
        const error = problems.find(problem => problem.path === `/${key}`);
        return <div className="purchase-input" key={key}><label htmlFor={id}>{filterLabels[field]}</label>
          <input id={id} type={key.startsWith('date') ? 'date' : 'text'} value={value} maxLength={key === 'q' ? 100 : 255} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            onChange={event => { setInputs(previous => ({ ...previous, [field]: event.target.value })); setProblems([]); }} />
          {error && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>}
        </div>;
      })}</div>
      <div className="purchase-filter-actions"><button type="submit">Aplicar filtros</button><button type="button" onClick={() => { setInputs({ q: '', dateFrom: '', dateTo: '', unitCode: '', projectCode: '' }); apply({}); }}>Limpiar filtros</button></div>
    </form>
    <RequestTable key={`pending-${generation}`} state="pending" title="Pendientes de validación" filters={filters} /><RequestTable key={`reviewed-${generation}`} state="reviewed" title="Registros validados" filters={filters} />
  </section>;
}
