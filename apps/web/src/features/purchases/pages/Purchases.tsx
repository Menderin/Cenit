import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { FunnelSimpleIcon } from '@phosphor-icons/react/dist/csr/FunnelSimple';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { FlaskIcon } from '@phosphor-icons/react/dist/csr/Flask';
import { useQuery } from '@tanstack/react-query';
import { validatePurchaseListQuery, type PurchaseFilters, type ContractProblem } from '@cenit/contracts/purchases';
import { listPurchases } from '../api/purchases.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { dateLabel, amountLabel } from '../model/fields.js';
import '../records.css';

function RequestTable({ state, title, filters }: { state: 'pending' | 'reviewed'; title: string; filters: PurchaseFilters }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['purchases', 'list', state, filters, page], queryFn: ({ signal }) => listPurchases(state, page, signal, filters) });
  const data = query.data;
  return <section className="purchase-list" aria-label={title}>
    <div className="purchase-list-heading"><h2>{title}</h2>{data && !query.isError && <><span className="purchase-count">{data.pagination.total} {data.pagination.total === 1 ? 'registro' : 'registros'}</span><span className="purchase-total">Total de solicitudes · CLP <strong>{amountLabel(data.totals.documentTotal)}</strong></span></>}</div>
    {query.isPending ? <p className="purchase-state" role="status">Cargando solicitudes…</p> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table>
        <caption className="purchase-sr-only">{title}</caption><thead><tr><th scope="col">Nº Solicitud</th><th scope="col">Fecha</th><th scope="col">Detalle</th><th scope="col">Tipo de documento</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{!data.data.length && <tr><td colSpan={5} className="purchase-empty"><span>{!data.pagination.total && Object.keys(filters).length ? 'No hay solicitudes que coincidan con los filtros.' : 'No hay solicitudes en esta página.'}</span></td></tr>}{data.data.map(record => <tr key={record.id}><th scope="row">{record.requestNumber}</th><td>{dateLabel(record.sentDate)}</td><td className="purchase-description"><span>{record.description}</span>{record.source === 'contract_example' && <p className="purchase-origin-notice">Ejemplo de demostración</p>}</td><td>{record.documentType ?? 'Sin dato'}</td><td className="purchase-row-actions">
          <div className="purchase-row-actions__controls"><Link to={`/administracion/compras/${record.id}`}>Ver detalles<ArrowUpRightIcon size={14} aria-hidden="true" /></Link>
          {state === 'pending' && <ValidateRecord id={record.id} version={record.version} />}
          </div>
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
  const [expanded, setExpanded] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const filterLabels = { q: 'Buscar solicitudes', dateFrom: 'Enviado desde', dateTo: 'Enviado hasta', unitCode: 'Código de unidad', projectCode: 'Código de proyecto' };
  useEffect(() => { if (problems.length) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(); }, [problems]);
  function apply(next: PurchaseFilters) { setFilters(next); setGeneration(value => value + 1); setProblems([]); }
  function filterInput(field: keyof typeof inputs) {
    const id = `purchase-filter-${field}`, error = problems.find(problem => problem.path === `/${field}`);
    return <div className="purchase-input" key={field}><label htmlFor={id}>{filterLabels[field]}</label>
      <div className={field === 'q' ? 'purchase-search-input' : undefined}>{field === 'q' && <MagnifyingGlassIcon size={16} aria-hidden="true" />}<input id={id} type={field.startsWith('date') ? 'date' : 'text'} value={inputs[field]} placeholder={field === 'q' ? 'Número, descripción o proveedor' : undefined} maxLength={field === 'q' ? 100 : 255} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setInputs(previous => ({ ...previous, [field]: event.target.value })); setProblems([]); }} /></div>
      {error && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>}
    </div>;
  }
  return <section className="purchase-records"><div className="purchase-page-heading"><div><h1>Sistema de compra</h1><p>Solicitudes registradas</p></div><div className="purchase-heading-actions"><Link className="purchase-secondary-link" to="/administracion/compras/laboratorio"><FlaskIcon size={15} aria-hidden="true" />Revisar ejemplo</Link><Link className="admin-primary" to="/administracion/compras/nueva"><PlusIcon size={16} aria-hidden="true" />Nueva solicitud</Link></div></div>
    <form ref={form} className="purchase-filters" noValidate aria-label="Filtros de solicitudes" onSubmit={event => {
      event.preventDefault();
      const values = { ...inputs, q: inputs.q.trim() };
      const next = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')) as PurchaseFilters;
      const errors = validatePurchaseListQuery({ ...next, reviewStatus: 'pending', page: 1, pageSize: 20 });
      setProblems(errors);
      if (errors.some(error => error.path === '/unitCode' || error.path === '/projectCode')) setExpanded(true);
      if (!errors.length) apply(next);
    }}>
      <div className="purchase-filter-grid">{filterInput('q')}{filterInput('dateFrom')}{filterInput('dateTo')}</div>
      <div id="purchase-more-filters" className="purchase-filter-extra" hidden={!expanded}><div className="purchase-input-grid">{filterInput('unitCode')}{filterInput('projectCode')}</div><p>Unidad y proyecto del mismo ítem.</p></div>
      <div className="purchase-filter-actions"><button className="purchase-filter-toggle" type="button" aria-expanded={expanded} aria-controls="purchase-more-filters" onClick={() => setExpanded(value => !value)}>Más filtros<CaretDownIcon size={14} aria-hidden="true" />{(inputs.unitCode || inputs.projectCode) && <span className="purchase-filter-dot" aria-label="Hay códigos ingresados" />}</button><div><button type="submit"><FunnelSimpleIcon size={14} aria-hidden="true" />Aplicar filtros</button><button type="button" onClick={() => { setInputs({ q: '', dateFrom: '', dateTo: '', unitCode: '', projectCode: '' }); apply({}); }}>Limpiar</button></div></div>
      {Object.keys(filters).length > 0 && <p className="purchase-applied-filters">{Object.keys(filters).length} {Object.keys(filters).length === 1 ? 'filtro aplicado' : 'filtros aplicados'} · Pendientes y validados</p>}
    </form>
    <RequestTable key={`pending-${generation}`} state="pending" title="Pendientes de validación" filters={filters} /><RequestTable key={`reviewed-${generation}`} state="reviewed" title="Registros validados" filters={filters} />
  </section>;
}
