import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
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
import { DateField } from '../../../shared/components/DateField.js';
import '../records.css';

function RequestTable({ state, title, filters, page, setPage, valid, searching, returnTo }: {
  state: 'pending' | 'reviewed'; title: string; filters: PurchaseFilters; page: number; setPage: (page: number) => void; valid: boolean; searching: boolean; returnTo: string;
}) {
  const query = useQuery({ queryKey: ['purchases', 'list', state, filters, page], queryFn: ({ signal }) => listPurchases(state, page, signal, filters), enabled: valid && !searching });
  const data = query.data;
  const heading = useRef<HTMLHeadingElement>(null);
  return <section className="purchase-list" aria-label={title}>
    <div className="purchase-list-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2>{data && !query.isError && !searching && <><span className="purchase-count">{data.pagination.total} {data.pagination.total === 1 ? 'registro' : 'registros'}</span><span className="purchase-total">Total de solicitudes · CLP <strong>{amountLabel(data.totals.documentTotal)}</strong></span></>}</div>
    {searching ? <p className="purchase-state" role="status">Buscando solicitudes…</p> : !valid ? <p className="purchase-state">Corrige los filtros para consultar las solicitudes.</p> : query.isPending ? <p className="purchase-state" role="status">Cargando solicitudes…</p> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table>
        <caption className="purchase-sr-only">{title}</caption><thead><tr><th scope="col">Nº Solicitud</th><th scope="col">Fecha</th><th scope="col">Detalle</th><th scope="col">Tipo de documento</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{!data.data.length && <tr><td colSpan={5} className="purchase-empty"><span>{!data.pagination.total && Object.keys(filters).length ? 'No hay solicitudes que coincidan con los filtros.' : 'No hay solicitudes en esta página.'}</span></td></tr>}{data.data.map(record => <tr key={record.id}><th scope="row">{record.requestNumber}</th><td>{dateLabel(record.sentDate)}</td><td className="purchase-description"><span>{record.description}</span>{record.source === 'image_capture' && <p className="purchase-origin-notice">Captura procesada y revisada</p>}{record.source === 'contract_example' && <p className="purchase-origin-notice">Ejemplo de demostración</p>}</td><td>{record.documentType ?? 'Sin dato'}</td><td className="purchase-row-actions">
          <div className="purchase-row-actions__controls"><Link to={`/administracion/compras/${record.id}`} state={{ purchasesReturnTo: returnTo }}>Ver detalles<ArrowUpRightIcon size={14} aria-hidden="true" /></Link>
          {state === 'pending' && <ValidateRecord id={record.id} version={record.version} requestNumber={record.requestNumber} fallbackFocus={heading} />}
          </div>
        </td></tr>)}</tbody>
      </table></div>
      <div className="purchase-pagination" aria-label={`Paginación: ${title}`}><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * 20 >= data.pagination.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>
    </>}
  </section>;
}
export function Purchases() {
  const [params, setParams] = useSearchParams(), location = useLocation();
  const readInputs = () => ({ q: params.get('q') ?? '', dateFrom: params.get('dateFrom') ?? '', dateTo: params.get('dateTo') ?? '', unitCode: params.get('unitCode') ?? '', projectCode: params.get('projectCode') ?? '' });
  const [inputs, setInputs] = useState(readInputs);
  const searchNavigation = useRef<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const filters = Object.fromEntries(Object.entries(readInputs()).filter(([, value]) => value !== '')) as PurchaseFilters;
  const filterKey = JSON.stringify(filters);
  const pendingFilters = Object.fromEntries(Object.entries({ ...inputs, q: inputs.q.trim() }).filter(([, value]) => value !== '')) as PurchaseFilters;
  const unapplied = JSON.stringify(pendingFilters) !== filterKey;
  const searchText = inputs.q.trim(), searching = searchText !== (filters.q ?? '');
  const valid = validatePurchaseListQuery({ ...filters, reviewStatus: 'pending', page: 1, pageSize: 20 }).length === 0;
  const returnTo = location.pathname + location.search;
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const [expanded, setExpanded] = useState(() => !!(params.get('unitCode') || params.get('projectCode')));
  const form = useRef<HTMLFormElement>(null);
  const filterLabels = { q: 'Buscar solicitudes', dateFrom: 'Enviado desde', dateTo: 'Enviado hasta', unitCode: 'Código de unidad', projectCode: 'Código de proyecto' };
  useEffect(() => { if (problems.length) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(); }, [problems]);
  useEffect(() => {
    if (searchNavigation.current === params.toString()) { searchNavigation.current = null; return; }
    searchNavigation.current = null;
    const values = readInputs(); setInputs(values);
    const errors = validatePurchaseListQuery({ ...filters, reviewStatus: 'pending', page: 1, pageSize: 20 });
    setProblems(errors);
    if (values.unitCode || values.projectCode) setExpanded(true);
  }, [filterKey]);
  useEffect(() => {
    if (!searching) return;
    const nextFilters = { ...filters };
    if (searchText) nextFilters.q = searchText; else delete nextFilters.q;
    if (validatePurchaseListQuery({ ...nextFilters, reviewStatus: 'pending', page: 1, pageSize: 20 }).length) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchText) next.set('q', searchText); else next.delete('q');
      next.delete('pendingPage'); next.delete('reviewedPage');
      // Preserve unfinished date/code inputs when only the live search changes the URL.
      searchNavigation.current = next.toString();
      setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchText, filterKey, location.search]);
  useEffect(() => { setFeedback(''); }, [location.search]);
  function apply(next: PurchaseFilters) {
    setInputs({ q: next.q ?? '', dateFrom: next.dateFrom ?? '', dateTo: next.dateTo ?? '', unitCode: next.unitCode ?? '', projectCode: next.projectCode ?? '' });
    setProblems([]);
    if (JSON.stringify(next) === filterKey && page('pending') === 1 && page('reviewed') === 1) {
      setFeedback(Object.keys(next).length ? 'Los filtros no han cambiado' : 'Ingresa al menos un filtro para acotar la búsqueda');
      return;
    }
    setFeedback('');
    setParams(new URLSearchParams(Object.entries(next).map(([key, value]) => [key, String(value)])));
  }
  function page(state: 'pending' | 'reviewed') {
    const value = Number(params.get(`${state}Page`) ?? 1);
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  }
  function setPage(state: 'pending' | 'reviewed', value: number) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value === 1) next.delete(`${state}Page`); else next.set(`${state}Page`, String(value)); return next; });
  }
  function filterInput(field: keyof typeof inputs) {
    const id = `purchase-filter-${field}`, error = problems.find(problem => problem.path === `/${field}`);
    return <div className="purchase-input" key={field}><label htmlFor={id}>{filterLabels[field]}</label>
      <div className={field === 'q' ? 'purchase-search-input' : undefined}>{field === 'q' && <MagnifyingGlassIcon size={16} aria-hidden="true" />}
        {field.startsWith('date') ? <DateField id={id} label={filterLabels[field]} value={inputs[field]} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          onValueChange={value => { setInputs(previous => ({ ...previous, [field]: value })); setProblems([]); setFeedback(''); }} />
          : <input id={id} type="text" value={inputs[field]} placeholder={field === 'q' ? 'Número, descripción o proveedor' : undefined} maxLength={field === 'q' ? 100 : 255} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            onChange={event => { setInputs(previous => ({ ...previous, [field]: event.target.value })); setProblems([]); setFeedback(''); }} />}</div>
      {error && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>}
    </div>;
  }
  return <section className="purchase-records"><div className="purchase-page-heading"><div><h1>Sistema de compra</h1><p>Solicitudes registradas</p></div><div className="purchase-heading-actions"><Link className="purchase-secondary-link" to="/administracion/compras/laboratorio" state={{ purchasesReturnTo: returnTo }}><FlaskIcon size={15} aria-hidden="true" />Revisar ejemplo</Link><Link className="admin-primary" to="/administracion/compras/captura" state={{ purchasesReturnTo: returnTo }}>Subir captura</Link><Link className="admin-primary" to="/administracion/compras/nueva" state={{ purchasesReturnTo: returnTo }}><PlusIcon size={16} aria-hidden="true" />Nueva solicitud</Link></div></div>
    <form ref={form} className="purchase-filters" noValidate aria-label="Filtros de solicitudes" onSubmit={event => {
      event.preventDefault();
      const next = pendingFilters;
      const errors = validatePurchaseListQuery({ ...next, reviewStatus: 'pending', page: 1, pageSize: 20 });
      setProblems(errors);
      if (errors.some(error => error.path === '/unitCode' || error.path === '/projectCode')) setExpanded(true);
      if (!errors.length) apply(next);
    }}>
      <p className="purchase-filter-help">La búsqueda se actualiza al escribir. Usa Aplicar filtros para fechas y códigos.</p>
      <div className="purchase-filter-grid">{filterInput('q')}{filterInput('dateFrom')}{filterInput('dateTo')}</div>
      <div id="purchase-more-filters" className="purchase-filter-extra" hidden={!expanded}><div className="purchase-input-grid">{filterInput('unitCode')}{filterInput('projectCode')}</div><p>Unidad y proyecto del mismo ítem.</p></div>
      <div className="purchase-filter-actions"><button className="purchase-filter-toggle" type="button" aria-expanded={expanded} aria-controls="purchase-more-filters" onClick={() => setExpanded(value => !value)}>Más filtros<CaretDownIcon size={14} aria-hidden="true" />{(inputs.unitCode || inputs.projectCode) && <span className="purchase-filter-dot" aria-label="Hay códigos ingresados" />}</button><div><button type="submit"><FunnelSimpleIcon size={14} aria-hidden="true" />Aplicar filtros</button><button type="button" onClick={() => { apply({}); }}>Limpiar</button></div></div>
      <p className={`purchase-filter-feedback${unapplied && !searching ? ' purchase-filter-feedback--pending' : ''}`} role="status" aria-atomic="true">{searching ? 'Buscando solicitudes…' : unapplied ? 'Cambios por aplicar' : !problems.length ? feedback : ''}</p>
      {Object.keys(filters).length > 0 && <p className="purchase-applied-filters">{Object.keys(filters).length} {Object.keys(filters).length === 1 ? 'filtro aplicado' : 'filtros aplicados'} · Pendientes y validados</p>}
    </form>
    <RequestTable state="pending" title="Pendientes de validación" filters={filters} page={page('pending')} setPage={value => setPage('pending', value)} valid={valid} searching={searching} returnTo={returnTo} />
    <RequestTable state="reviewed" title="Registros validados" filters={filters} page={page('reviewed')} setPage={value => setPage('reviewed', value)} valid={valid} searching={searching} returnTo={returnTo} />
  </section>;
}
