import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import * as Popover from '@radix-ui/react-popover';
import { FunnelSimpleIcon } from '@phosphor-icons/react/dist/csr/FunnelSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { validatePurchaseListQuery, type PurchaseFilters } from '@cenit/contracts/purchases';
import { listPurchases } from '../api/purchases.js';
import { usePurchaseCapabilities } from '../model/capabilities.js';
import { SheetsSyncStatus } from '../components/SheetsSyncStatus.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { dateLabel, amountLabel } from '../model/fields.js';
import { DateField } from '../../../shared/components/DateField.js';
import { useExitPresence } from '../../../shared/lib/use-exit-presence.js';
import '../records.css';

const labels = { q: 'Buscar solicitudes', dateFrom: 'Enviado desde', dateTo: 'Enviado hasta', unitCode: 'Código de unidad', projectCode: 'Código de proyecto' };
function RequestTable({ state, title, filters, page, setPage, valid, searching, returnTo }: {
  state: 'pending' | 'reviewed' | 'all'; title: string; filters: PurchaseFilters; page: number; setPage: (page: number) => void; valid: boolean; searching: boolean; returnTo: string;
}) {
  const query = useQuery({ queryKey: ['purchases', 'list', state, filters, page], queryFn: ({ signal }) => listPurchases(state, page, signal, filters), enabled: valid, placeholderData: keepPreviousData });
  const data = query.data, updating = searching || query.isFetching || query.isPlaceholderData;
  const heading = useRef<HTMLHeadingElement>(null);
  const actions = (record: NonNullable<typeof data>['data'][number]) => <div className="purchase-row-actions__controls"><Link to={`/administracion/compras/${record.id}`} aria-disabled={updating} onClick={event => { if (updating) event.preventDefault(); }} state={{ purchasesReturnTo: returnTo }}>Ver detalles<ArrowUpRightIcon size={16} aria-hidden="true" /></Link>{state === 'pending' && !updating && <ValidateRecord id={record.id} version={record.version} requestNumber={record.requestNumber} fallbackFocus={heading} />}</div>;
  return <section className="purchase-list" aria-label={title} aria-busy={updating}>
    <div className="purchase-list-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2>{data && !query.isError && <><span className="purchase-count">{data.pagination.total} {data.pagination.total === 1 ? 'registro' : 'registros'}</span><span className="purchase-total">Total documental · CLP <strong>{amountLabel(data.totals.documentTotal)}</strong></span></>}</div>
    {updating && <p className="purchase-updating" role="status">Actualizando resultados…</p>}
    {!valid ? <p className="purchase-state">Corrige los filtros para consultar las compras.</p> : query.isPending ? <div className="purchase-list-skeleton" role="status">Cargando compras…<i /><i /><i /></div> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      {!data.data.length ? <div className="purchase-empty"><MagnifyingGlassIcon size={28} aria-hidden="true" /><h3>{Object.keys(filters).length ? 'No encontramos compras con estos filtros' : 'Aún no hay compras registradas'}</h3><p>{Object.keys(filters).length ? 'Prueba con otro número, fecha o código.' : 'Sube una captura o registra la primera compra manualmente.'}</p></div> : <>
      <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table><caption className="purchase-sr-only">{title}</caption><thead><tr><th scope="col">Nº Solicitud</th><th scope="col">Fecha de envío</th><th scope="col">Detalle</th><th scope="col">Tipo de documento</th><th scope="col" className="purchase-money">Monto · CLP</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{data.data.map(record => <tr key={record.id}><th scope="row" className="purchase-request-number">{record.requestNumber}</th><td className="purchase-sent-date" data-label="Fecha de envío">{dateLabel(record.sentDate)}</td><td className="purchase-description"><span>{record.description}</span><p className="purchase-origin-notice">{record.source === 'image_capture' ? 'Desde captura' : record.source === 'contract_example' ? 'Ejemplo de demostración' : 'Ingreso manual'}</p></td><td className="purchase-document-type" data-label="Documento">{record.documentType ?? 'Sin dato'}</td><td className="purchase-money">{amountLabel(record.totalAmount)}</td><td className="purchase-row-actions">{actions(record)}</td></tr>)}</tbody>
      </table></div>

      </>}
      <div className="purchase-pagination" aria-label={`Paginación: ${title}`}><button disabled={page === 1 || updating} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(data.pagination.total / 20))}</span><button disabled={page * 20 >= data.pagination.total || updating} onClick={() => setPage(page + 1)}>Siguiente</button></div>
    </>}
  </section>;
}

export function Purchases() {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const options = useExitPresence(optionsOpen);
  const { secondReviewEnabled } = usePurchaseCapabilities();
  const [params, setParams] = useSearchParams(), location = useLocation();
  const readInputs = () => ({ q: params.get('q') ?? '', dateFrom: params.get('dateFrom') ?? '', dateTo: params.get('dateTo') ?? '', unitCode: params.get('unitCode') ?? '', projectCode: params.get('projectCode') ?? '' });
  const [inputs, setInputs] = useState(readInputs), [touched, setTouched] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(() => Object.keys(readInputs()).some(key => key !== 'q' && params.has(key)));
  const filters = Object.fromEntries(Object.entries(readInputs()).filter(([, value]) => value !== '')) as PurchaseFilters;
  const pending = Object.fromEntries(Object.entries({ ...inputs, q: inputs.q.trim() }).filter(([, value]) => value !== '')) as PurchaseFilters;
  const filterKey = JSON.stringify(filters), pendingKey = JSON.stringify(pending), ownNavigation = useRef<string | null>(null);
  const errors = validatePurchaseListQuery({ ...pending, reviewStatus: 'all', page: 1, pageSize: 20 });
  const valid = validatePurchaseListQuery({ ...filters, reviewStatus: 'all', page: 1, pageSize: 20 }).length === 0;
  const changed = pendingKey !== filterKey, returnTo = location.pathname + location.search;
  useEffect(() => {
    if (ownNavigation.current === params.toString()) { ownNavigation.current = null; return; }
    ownNavigation.current = null; setInputs(readInputs()); setTouched([]);
  }, [filterKey]);
  useEffect(() => {
    if (!changed || errors.length) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(Object.entries(pending).map(([key, value]) => [key, String(value)]));
      ownNavigation.current = next.toString(); setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pendingKey, filterKey, changed, errors.length]);
  function remove(field?: keyof typeof inputs) { setInputs(field ? { ...inputs, [field]: '' } : { q: '', dateFrom: '', dateTo: '', unitCode: '', projectCode: '' }); setTouched([]); }
  function input(field: keyof typeof inputs) {
    const id = `purchase-filter-${field}`, error = touched.includes(field) ? errors.find(problem => problem.path === `/${field}`) : undefined;
    const props = { id, value: inputs[field], 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined, onBlur: () => setTouched(previous => previous.includes(field) ? previous : [...previous, field]) };
    return <div className="purchase-input" key={field}><label htmlFor={id}>{labels[field]}</label><div className={field === 'q' ? 'purchase-search-input' : undefined}>{field === 'q' && <MagnifyingGlassIcon size={18} aria-hidden="true" />}
      {field.startsWith('date') ? <DateField {...props} label={labels[field]} onValueChange={value => setInputs(previous => ({ ...previous, [field]: value }))} /> : <input {...props} type="text" placeholder={field === 'q' ? 'Número, descripción o proveedor' : undefined} maxLength={field === 'q' ? 100 : 255} onChange={event => setInputs(previous => ({ ...previous, [field]: event.target.value }))} />}</div>{error && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>}</div>;
  }
  function page(state: 'pending' | 'reviewed' | 'all') { const value = Number(params.get(state === 'all' ? 'page' : `${state}Page`) ?? 1); return Number.isSafeInteger(value) && value > 0 ? value : 1; }
  function setPage(state: 'pending' | 'reviewed' | 'all', value: number) { setParams(previous => { const next = new URLSearchParams(previous), key = state === 'all' ? 'page' : `${state}Page`; if (value === 1) next.delete(key); else next.set(key, String(value)); return next; }); }
  return <section className="purchase-records"><div className="purchase-page-heading"><div><p className="admin-section-label">Compras</p><h1>Registro de compras</h1><p>Compras aprobadas en Oracle, conservadas en Cenit.</p></div><div className="purchase-heading-actions">
    <Link className="admin-button" to="/administracion/compras/nueva" state={{ purchasesReturnTo: returnTo }}>Registrar manualmente</Link><Link className="admin-primary" to="/administracion/compras/captura" state={{ purchasesReturnTo: returnTo }}><UploadSimpleIcon size={18} aria-hidden="true" />Subir captura</Link>
    <Popover.Root open={options.mounted} onOpenChange={setOptionsOpen}><Popover.Trigger asChild><button className="admin-icon-button" aria-label="Más opciones" onClick={event => { if (options.closing) { event.preventDefault(); setOptionsOpen(true); } }}><DotsThreeIcon size={22} aria-hidden="true" /></button></Popover.Trigger><Popover.Portal><Popover.Content inert={options.closing} className={`cenit-popover purchase-options${options.closing ? ' cenit-closing' : ''}`} align="end" sideOffset={8}><Link to="/administracion/compras/laboratorio" state={{ purchasesReturnTo: returnTo }}>Revisar ejemplo</Link></Popover.Content></Popover.Portal></Popover.Root>
  </div></div><SheetsSyncStatus />
    <form className="purchase-filters" noValidate aria-label="Filtros de solicitudes" onSubmit={event => event.preventDefault()}>
      <div className="purchase-search-bar">{input('q')}<button className="purchase-filter-toggle" type="button" aria-expanded={expanded} aria-controls="purchase-more-filters" onClick={() => setExpanded(value => !value)}><FunnelSimpleIcon size={18} aria-hidden="true" />Filtros{Object.keys(filters).filter(key => key !== 'q').length > 0 && <span className="purchase-count">{Object.keys(filters).filter(key => key !== 'q').length}</span>}</button></div>
      <div id="purchase-more-filters" className="purchase-filter-extra" hidden={!expanded}><div className="purchase-filter-grid">{input('dateFrom')}{input('dateTo')}{input('unitCode')}{input('projectCode')}</div><p>Los códigos deben coincidir en el mismo ítem.</p></div>
      <div className="purchase-filter-feedback" role="status" aria-atomic="true">{changed && errors.length ? 'Completa una fecha válida o corrige el rango para actualizar los filtros. Se conservan los últimos resultados.' : changed ? 'Actualizando filtros…' : ''}</div>
      {Object.keys(filters).length > 0 && <div className="purchase-filter-chips" aria-label="Filtros activos">{Object.entries(filters).map(([key, value]) => <button type="button" key={key} aria-label={`Quitar filtro: ${labels[key as keyof typeof inputs]}`} onClick={() => remove(key as keyof typeof inputs)}>{key === 'q' ? value : `${labels[key as keyof typeof inputs]}: ${key.startsWith('date') ? dateLabel(value!) : value}`}<XIcon size={14} aria-hidden="true" /></button>)}<button type="button" className="purchase-clear-filters" onClick={() => remove()}>Limpiar</button></div>}
    </form>
    {secondReviewEnabled ? <><RequestTable state="pending" title="Por revisar en Cenit" filters={filters} page={page('pending')} setPage={value => setPage('pending', value)} valid={valid} searching={changed && !errors.length} returnTo={returnTo} /><RequestTable state="reviewed" title="Revisados en Cenit" filters={filters} page={page('reviewed')} setPage={value => setPage('reviewed', value)} valid={valid} searching={changed && !errors.length} returnTo={returnTo} /></> : <RequestTable state="all" title="Compras registradas" filters={filters} page={page('all')} setPage={value => setPage('all', value)} valid={valid} searching={changed && !errors.length} returnTo={returnTo} />}
  </section>;
}
