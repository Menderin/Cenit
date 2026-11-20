import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { FunnelSimpleIcon } from '@phosphor-icons/react/dist/csr/FunnelSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { validatePurchaseListQuery, type PurchaseFilters, type PurchaseListQuery } from '@cenit/contracts/purchases';
import { listPurchases } from '../api/purchases.js';
import { PurchaseCapabilitiesProvider } from '../model/capabilities.js';
import { SheetsSyncStatus } from '../components/SheetsSyncStatus.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { PurchasePagination } from '../components/PurchasePagination.js';
import { Select } from '../../../shared/components/Select.js';
import { dateLabel, amountLabel, sentenceCase } from '../model/fields.js';
import { periodRange, selectedPeriod } from '../model/list.js';
import { DateField } from '../../../shared/components/DateField.js';
import { LoadingLabel, Skeleton, TableSkeleton } from '../../../shared/components/Skeleton.js';
import { useExitPresence } from '../../../shared/lib/use-exit-presence.js';
import { PurchaseDateRangeField } from '../components/PurchaseDateRangeField.js';
import { ExportExcel } from '../components/ExportExcel.js';
import '../records.css';

const labels = { q: 'Buscar solicitudes', unitCode: 'Código de unidad', projectCode: 'Código de proyecto' };
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const currentSantiagoYear = () => new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric' }).format(new Date());
type ListView = Pick<PurchaseListQuery, 'sort' | 'pageSize'>;
type FilterInput = { q: string; dateFrom: string; dateTo: string; unitCode: string; projectCode: string };
type FilterChip = { key: keyof FilterInput | 'period'; label: string };
function RequestTable({ state, title, filters, page, setPage, view, setPageSize, onYears, valid, searching, returnTo, onClearFilters, searchAllYears }: {
  state: 'pending' | 'reviewed' | 'all'; title: string; filters: PurchaseFilters; page: number; setPage: (page: number) => void; valid: boolean; searching: boolean; returnTo: string;
  onClearFilters?: () => void; searchAllYears?: { year: string; run: () => void };
  view: ListView; setPageSize: (size: number) => void; onYears: (years: number[] | undefined) => void;
}) {
  const query = useQuery({ queryKey: ['purchases', 'list', state, filters, page, view], queryFn: ({ signal }) => listPurchases(state, page, signal, filters, view), enabled: valid, placeholderData: keepPreviousData });
  const data = query.data, updating = searching || query.isFetching || query.isPlaceholderData;
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPage = useRef(`${page}:${view.pageSize}`);
  const filterKey = JSON.stringify(filters), previousFilters = useRef(filterKey);
  useEffect(() => { if (query.isError || query.isSuccess) onYears(query.isError ? undefined : data?.availableYears); }, [data?.availableYears, query.isError, query.isSuccess, onYears]);
  useEffect(() => {
    const current = `${page}:${view.pageSize}`;
    if (updating || query.isError) return;
    const filtersChanged = previousFilters.current !== filterKey;
    previousFilters.current = filterKey;
    if (previousPage.current === current) return;
    previousPage.current = current;
    if (filtersChanged) return;
    heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' });
  }, [page, view.pageSize, updating, query.isError, filterKey]);
  const navigate = useNavigate(), hasActions = state === 'pending';
  const detail = (id: string) => `/administracion/compras/${id}`;
  // The whole row opens the detail for pointer users; keyboard and screen readers use the request-number link.
  function openRow(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if (updating || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target) || target.closest('a, button, input') || window.getSelection()?.toString()) return;
    navigate(detail(id), { state: { purchasesReturnTo: returnTo } });
  }
  return <section className="purchase-list" aria-label={title} aria-busy={updating}>
    <div className="purchase-list-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2>{data && !query.isError && <><span className="purchase-count">{data.pagination.total} {data.pagination.total === 1 ? 'registro' : 'registros'}</span>{updating && <span className="purchase-updating" role="status">Actualizando resultados…</span>}<span className="purchase-total">Total documental · CLP <strong>{amountLabel(data.totals.documentTotal)}</strong></span></>}</div>
    {!valid ? <p className="purchase-state">Corrige los filtros para consultar las compras.</p> : query.isPending ? <><LoadingLabel>Cargando compras…</LoadingLabel><TableSkeleton className="purchase-table-scroll" columns={hasActions ? [1, 1, 3, 1, 1, 1, .15] : [1, 1, 3, 1, 1, .15]} /></> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button className="cenit-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      {!data.data.length ? <div className="cenit-empty cenit-empty--bordered"><span className="cenit-empty__icon"><MagnifyingGlassIcon size={26} aria-hidden="true" /></span><h3>{page > 1 ? 'Esta página ya no tiene compras' : Object.keys(filters).length ? 'No encontramos compras con estos filtros' : 'Aún no hay compras registradas'}</h3><p>{page > 1 ? 'Vuelve al inicio del listado para ver los resultados disponibles.' : searchAllYears ? `Sólo se buscó en ${searchAllYears.year}. Prueba en todos los años o con otro número o código.` : Object.keys(filters).length ? 'Prueba con otro período, número o código.' : 'Sube una captura o registra la primera compra manualmente.'}</p>{page > 1 ? <button className="cenit-button" type="button" disabled={updating} onClick={() => setPage(1)}>Ir a la primera página</button> : <div className="cenit-empty__actions">{searchAllYears && <button className="cenit-button cenit-button--primary" type="button" disabled={updating} onClick={() => { heading.current?.focus({ preventScroll: true }); searchAllYears.run(); }}>Buscar en todos los años</button>}{onClearFilters && <button className="cenit-button" type="button" disabled={updating} onClick={onClearFilters}>Quitar filtros</button>}</div>}</div> : <>
      <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table className={hasActions ? 'purchase-table--actions' : undefined}><caption className="purchase-sr-only">{title}</caption><thead><tr><th scope="col">Nº Solicitud</th><th scope="col">Fecha de envío</th><th scope="col">Detalle</th><th scope="col">Tipo de documento</th><th scope="col" className="purchase-money">Monto · CLP</th>{hasActions && <th scope="col"><span className="purchase-sr-only">Acciones</span></th>}<th aria-hidden="true" className="purchase-row-caret" /></tr></thead>
        <tbody>{data.data.map(record => <tr key={record.id} className="purchase-row" onClick={event => openRow(event, record.id)}><th scope="row" className="purchase-request-number"><Link to={detail(record.id)} aria-disabled={updating} onClick={event => { if (updating) event.preventDefault(); }} state={{ purchasesReturnTo: returnTo }} aria-label={`Ver detalles de ${record.requestNumber}`}>{record.requestNumber}</Link></th><td className="purchase-sent-date" data-label="Fecha de envío">{dateLabel(record.sentDate)}</td><td className="purchase-description"><span>{record.description}</span>{record.source === 'contract_example' && <span className="purchase-origin-tag">Ejemplo de demostración</span>}</td><td className="purchase-document-type" data-label="Documento">{record.documentType ? sentenceCase(record.documentType) : 'Sin dato'}</td><td className="purchase-money">{amountLabel(record.totalAmount)}</td>{hasActions && <td className="purchase-row-actions">{!updating && <ValidateRecord id={record.id} version={record.version} requestNumber={record.requestNumber} fallbackFocus={heading} />}</td>}<td aria-hidden="true" className="purchase-row-caret"><CaretRightIcon size={16} /></td></tr>)}</tbody>
      </table></div>
      </>}
      {data.pagination.total > 0 && <PurchasePagination title={title} page={page} pageSize={data.pagination.pageSize} total={data.pagination.total} updating={updating} setPage={setPage} setPageSize={setPageSize} />}
    </>}
  </section>;
}

export function Purchases() {
  const [params, setParams] = useSearchParams(), location = useLocation();
  const readInputs = (): FilterInput => ({ q: params.get('q') ?? '', dateFrom: params.get('dateFrom') ?? '', dateTo: params.get('dateTo') ?? '', unitCode: params.get('unitCode') ?? '', projectCode: params.get('projectCode') ?? '' });
  const [inputs, setInputs] = useState(readInputs), [touched, setTouched] = useState<string[]>([]);
  const inferDateMode = (values: FilterInput) => selectedPeriod(values).year === 'custom' ? (values.dateFrom === values.dateTo ? 'exact' : 'range') : null;
  const [dateMode, setDateMode] = useState<'exact' | 'range' | null>(() => inferDateMode(readInputs()));
  const [expanded, setExpanded] = useState(() => params.has('unitCode') || params.has('projectCode') || selectedPeriod(readInputs()).year === 'custom');
  const { mounted: filtersMounted, closing: filtersClosing } = useExitPresence(expanded);
  const [availableYears, setAvailableYears] = useState<number[]>();
  const [yearsUnavailable, setYearsUnavailable] = useState(false);
  const [dateWarnings, setDateWarnings] = useState({ exact: '', range: '' });
  const queryClient = useQueryClient();
  const receiveYears = useCallback((years: number[] | undefined) => { setYearsUnavailable(!years); if (years) setAvailableYears(years); }, []);
  const dateBounds = { minYear: availableYears?.length ? Math.min(...availableYears) : undefined, maxYear: availableYears?.length ? Math.max(...availableYears) : undefined, disabled: !availableYears?.length };
  const dateWarning = dateMode ? dateWarnings[dateMode] : '';
  const sort = params.get('sort') === 'sentDateAsc' ? 'sentDateAsc' : 'sentDateDesc';
  const pageSize = [20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const view: ListView = { sort, pageSize }, period = selectedPeriod(inputs);
  const allYears = params.get('allYears') === '1', currentYear = currentSantiagoYear();
  const selected = period.year || allYears ? period : { year: currentYear, month: '' };
  const years = [...new Set([...(availableYears ?? []), ...(selected.year && selected.year !== 'custom' ? [Number(selected.year)] : [])])].sort((a, b) => b - a);
  const resolveDefaultYear = (source: PurchaseFilters) => !allYears && !source.dateFrom && !source.dateTo ? { ...source, ...periodRange(currentYear) } : source;
  const filters = Object.fromEntries(Object.entries(resolveDefaultYear(readInputs())).filter(([, value]) => value !== '')) as PurchaseFilters;
  const pendingInputs = Object.fromEntries(Object.entries({ ...inputs, q: inputs.q.trim() }).filter(([, value]) => value !== '')) as PurchaseFilters;
  const pending = Object.fromEntries(Object.entries(resolveDefaultYear(pendingInputs)).filter(([, value]) => value !== '')) as PurchaseFilters;
  const visibleInputs = readInputs(), visiblePeriod = selectedPeriod(visibleInputs);
  const hasNonDefaultQuickPeriod = allYears || (!!visiblePeriod.year && visiblePeriod.year !== currentYear) || !!visiblePeriod.month;
  const activeFilters: FilterChip[] = (['q', 'unitCode', 'projectCode'] as const).flatMap(key => visibleInputs[key] ? [{ key, label: key === 'q' ? visibleInputs.q : `${labels[key]}: ${visibleInputs[key]}` }] : []);
  if (visiblePeriod.year === 'custom') {
    if (visibleInputs.dateFrom && visibleInputs.dateTo && visibleInputs.dateFrom === visibleInputs.dateTo) {
      activeFilters.push({ key: 'period', label: `Fecha de envío: ${dateLabel(visibleInputs.dateFrom)}` });
    } else if (visibleInputs.dateFrom || visibleInputs.dateTo) {
      const from = visibleInputs.dateFrom ? dateLabel(visibleInputs.dateFrom) : 'dd/mm/aaaa';
      const to = visibleInputs.dateTo ? dateLabel(visibleInputs.dateTo) : 'dd/mm/aaaa';
      activeFilters.push({ key: 'period', label: `Rango de fechas: ${from} – ${to}` });
    }
  }
  const filterKey = JSON.stringify(filters), pendingKey = JSON.stringify(pending), ownNavigation = useRef<string | null>(null);
  const errors = validatePurchaseListQuery({ ...pending, reviewStatus: 'all', page: 1, pageSize: 20 });
  if (dateWarning) errors.unshift({ path: '/dateFrom', message: dateWarning });
  if (dateMode === 'range' && (!!inputs.dateFrom !== !!inputs.dateTo) && !errors.length) errors.push({ path: inputs.dateFrom ? '/dateTo' : '/dateFrom', message: 'Completa ambas fechas del rango.' });
  const valid = validatePurchaseListQuery({ ...filters, reviewStatus: 'all', page: 1, pageSize: 20 }).length === 0;
  const changed = pendingKey !== filterKey, returnTo = location.pathname + location.search;
  useEffect(() => {
    if (ownNavigation.current === params.toString()) { ownNavigation.current = null; return; }
    ownNavigation.current = null; setInputs(readInputs()); setDateMode(inferDateMode(readInputs())); setDateWarnings({ exact: '', range: '' }); setTouched([]);
  }, [filterKey, currentYear]);
  useEffect(() => {
    if (!changed || errors.length) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(Object.entries({ ...pendingInputs, ...(sort === 'sentDateAsc' ? { sort } : {}), ...(pageSize !== 20 ? { pageSize: String(pageSize) } : {}) }).map(([key, value]) => [key, String(value)]));
      if (allYears && !pendingInputs.dateFrom && !pendingInputs.dateTo) next.set('allYears', '1');
      ownNavigation.current = next.toString(); setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pendingKey, filterKey, changed, errors.length, sort, pageSize, allYears]);
  function remove(field?: FilterChip['key']) {
    if (!field) {
      setInputs({ q: '', dateFrom: '', dateTo: '', unitCode: '', projectCode: '' }); setDateMode(null); setDateWarnings({ exact: '', range: '' }); setTouched([]);
      setParams(previous => {
        const next = new URLSearchParams(previous);
        for (const key of ['q', 'dateFrom', 'dateTo', 'unitCode', 'projectCode', 'allYears', 'page', 'pendingPage', 'reviewedPage']) next.delete(key);
        ownNavigation.current = next.toString(); return next;
      }, { replace: true });
      return;
    }
    if (field === 'period') { setInputs(previous => ({ ...previous, dateFrom: '', dateTo: '' })); setDateMode(null); }
    else setInputs(previous => ({ ...previous, [field]: '' }));
    setTouched([]);
  }
  function setView(key: 'sort' | 'pageSize', value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const pageKey of ['page', 'pendingPage', 'reviewedPage']) next.delete(pageKey);
      if (value === (key === 'sort' ? 'sentDateDesc' : '20')) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
  }
  function setPeriod(year: string, month = '') {
    setInputs(previous => ({ ...previous, ...periodRange(year, month) })); setDateMode(null); setDateWarnings({ exact: '', range: '' }); setTouched([]);
    if (!year) setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('dateFrom'); next.delete('dateTo'); next.set('allYears', '1');
      for (const pageKey of ['page', 'pendingPage', 'reviewedPage']) next.delete(pageKey);
      ownNavigation.current = next.toString(); return next;
    }, { replace: true });
  }
  function input(field: 'q' | 'unitCode' | 'projectCode') {
    const id = `purchase-filter-${field}`, error = touched.includes(field) ? errors.find(problem => problem.path === `/${field}`) : undefined;
    const props = { id, value: inputs[field], 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined, onBlur: () => setTouched(previous => previous.includes(field) ? previous : [...previous, field]) };
    return <div className="purchase-input" key={field}><label htmlFor={id} className={field === 'q' ? 'purchase-sr-only' : undefined}>{labels[field]}</label><div className={field === 'q' ? 'purchase-search-input' : undefined}>{field === 'q' && <MagnifyingGlassIcon size={18} aria-hidden="true" />}
      <input {...props} className="cenit-input" type="text" placeholder={field === 'q' ? 'Número, descripción o proveedor' : undefined} maxLength={field === 'q' ? 100 : 255} onChange={event => setInputs(previous => ({ ...previous, [field]: event.target.value }))} />
    </div>{error && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>}</div>;
  }
  const dateProblem = errors.find(problem => problem.path === '/dateFrom' || problem.path === '/dateTo');
  const dateError = dateWarning ? { message: dateWarning } : touched.includes('dateFrom') || touched.includes('dateTo') || [inputs.dateFrom, inputs.dateTo].some(value => value.length === 10 && !value.includes('_')) ? dateProblem : undefined;
  const exactDate = dateMode === 'exact' ? inputs.dateFrom : '';
  const rangeFrom = dateMode === 'range' ? inputs.dateFrom : '';
  const rangeTo = dateMode === 'range' ? inputs.dateTo : '';

  function exactDateField() {
    const id = 'purchase-filter-exact-date';
    const exactError = dateError && dateMode === 'exact' ? dateError : undefined;
    return <div className="purchase-input purchase-input--exact-date" key="exactDate"><label htmlFor={id}>Fecha de envío</label><DateField {...dateBounds} closeOnSelect={false} onValidationError={message => setDateWarnings(previous => ({ ...previous, exact: message }))} id={id} label="Fecha de envío" value={exactDate}
      aria-invalid={!!exactError || undefined} aria-describedby={exactError ? `${id}-error` : undefined}
      onValueChange={date => { setDateMode('exact'); setInputs(previous => ({ ...previous, dateFrom: date, dateTo: date })); setTouched([]); }}
      onBlur={() => setTouched(previous => [...new Set([...previous, 'dateFrom', 'dateTo'])])} />
      {exactError && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{exactError.message}</p>}
    </div>;
  }

  function dateRangeField() {
    const id = 'purchase-filter-date-range';
    const rangeError = dateError && dateMode === 'range' ? dateError : undefined;
    return <div className="purchase-input purchase-input--date-range" key="dateRange"><label htmlFor={id}>Rango de fechas</label><PurchaseDateRangeField {...dateBounds} onValidationError={message => setDateWarnings(previous => ({ ...previous, range: message }))} id={id}
      from={rangeFrom} to={rangeTo}
      invalid={!!rangeError} describedBy={rangeError ? `${id}-error` : undefined}
      onValueChange={(dateFrom, dateTo) => { setDateMode('range'); setInputs(previous => ({ ...previous, dateFrom, dateTo })); setTouched([]); }}
      onBlur={() => setTouched(previous => [...new Set([...previous, 'dateFrom', 'dateTo'])])} />
      {rangeError && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{rangeError.message}</p>}
    </div>;
  }
  function page(state: 'pending' | 'reviewed' | 'all') { const value = Number(params.get(state === 'all' ? 'page' : `${state}Page`) ?? 1); return Number.isSafeInteger(value) && value > 0 ? value : 1; }
  function setPage(state: 'pending' | 'reviewed' | 'all', value: number) { setParams(previous => { const next = new URLSearchParams(previous), key = state === 'all' ? 'page' : `${state}Page`; if (value === 1) next.delete(key); else next.set(key, String(value)); return next; }); }
  // The export always uses the applied filters, never an unsaved draft in the inputs.
  const appliedPeriod = filters.dateFrom && filters.dateTo ? (filters.dateFrom.endsWith('-01-01') && filters.dateTo === `${filters.dateFrom.slice(0, 4)}-12-31` ? `año ${filters.dateFrom.slice(0, 4)}` : filters.dateFrom === filters.dateTo ? dateLabel(filters.dateFrom) : `${dateLabel(filters.dateFrom)} – ${dateLabel(filters.dateTo)}`) : 'todos los años';
  const appliedDetail = [`Fecha de envío: ${appliedPeriod}`, ...activeFilters.filter(filter => filter.key !== 'period').map(filter => filter.key === 'q' ? `Búsqueda: «${filter.label}»` : filter.label)].join(' · ');
  const exportOptions = [{ id: 'current', label: 'Lo que estás viendo', detail: appliedDetail, filters }, ...(Object.keys(filters).length ? [{ id: 'all', label: 'Todo el historial', detail: 'Todas las compras registradas en Cenit, sin filtros.', filters: {} }] : [])];
  return <section className="purchase-records"><div className="purchase-page-heading"><div><h1>Registro de compras</h1><p>Compras aprobadas en Oracle, conservadas en Cenit.</p></div><div className="purchase-heading-actions">
    <ExportExcel iconOnly options={exportOptions} sort={sort} />
    <Link className="cenit-button" to="/administracion/compras/nueva" state={{ purchasesReturnTo: returnTo }}>Registrar manualmente</Link><Link className="cenit-button cenit-button--primary" to="/administracion/compras/captura" state={{ purchasesReturnTo: returnTo }}><UploadSimpleIcon size={18} aria-hidden="true" />Subir captura</Link>
  </div></div>
    <form className="purchase-filters" noValidate aria-label="Filtros de solicitudes" onSubmit={event => event.preventDefault()}>
      <div className="purchase-search-bar">{input('q')}
        <div className="purchase-inline-select purchase-select-year"><Select className="cenit-button purchase-select-trigger" label="Año de envío" placeholder="Año" value={selected.year} onValueChange={value => setPeriod(value, selected.month)} options={[{ value: '', label: 'Todos los años' }, ...(selected.year === 'custom' ? [{ value: 'custom', label: 'Rango personalizado', disabled: true }] : []), ...years.map(year => ({ value: String(year).padStart(4, '0'), label: String(year) }))]} /></div>
        <div className="purchase-inline-select purchase-select-month"><Select className="cenit-button purchase-select-trigger" label="Mes de envío" placeholder="Mes" value={selected.month} disabled={!selected.year || selected.year === 'custom'} onValueChange={value => setPeriod(selected.year, value)} options={[{ value: '', label: 'Todos los meses' }, ...months.map((month, index) => ({ value: String(index + 1).padStart(2, '0'), label: month }))]} /></div>
        <div className="purchase-inline-select purchase-sort"><Select className="cenit-button purchase-select-trigger" label="Ordenar por fecha de envío" value={sort} onValueChange={value => setView('sort', value)} options={[{ value: 'sentDateDesc', label: 'Más recientes' }, { value: 'sentDateAsc', label: 'Más antiguas' }]} /></div>
        <button className="cenit-button purchase-filter-toggle" type="button" aria-expanded={expanded} aria-controls={filtersMounted ? 'purchase-more-filters' : undefined} onClick={() => setExpanded(value => !value)}><FunnelSimpleIcon size={18} aria-hidden="true" />Más filtros{activeFilters.filter(filter => filter.key !== 'q').length > 0 && <span className="purchase-count">{activeFilters.filter(filter => filter.key !== 'q').length}</span>}</button>
        <button disabled={!(hasNonDefaultQuickPeriod || activeFilters.length > 0 || changed || dateWarning)} className="cenit-button purchase-clear-period" type="button" onClick={() => remove()}>Limpiar</button>
      </div>
      {filtersMounted && <div id="purchase-more-filters" className={`purchase-filter-extra${filtersClosing ? ' purchase-filter-extra--closing' : ''}`} aria-hidden={filtersClosing || undefined} inert={filtersClosing || undefined}><div className="purchase-filter-extra__clip"><div className="purchase-filter-extra__content"><div className="purchase-filter-grid">{exactDateField()}{dateRangeField()}{input('unitCode')}{input('projectCode')}</div></div></div></div>}
      {expanded && !availableYears?.length && <p className="purchase-filter-feedback">{yearsUnavailable ? 'No se pudieron cargar los años del historial.' : availableYears ? 'Las fechas estarán disponibles cuando haya compras registradas.' : 'Cargando años del historial…'}{yearsUnavailable && <button className="cenit-button" type="button" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['purchases', 'list'] }); }}>Reintentar</button>}</p>}
      {!expanded && activeFilters.some(filter => filter.key !== 'q') && <div className="purchase-filter-chips" aria-label="Filtros activos">{activeFilters.filter(filter => filter.key !== 'q').map(filter => <button className="cenit-button" type="button" key={filter.key} aria-label={`Quitar filtro: ${filter.label}`} onClick={() => remove(filter.key)}>{filter.label}<XIcon size={14} aria-hidden="true" /></button>)}</div>}
    </form>
    <PurchaseCapabilitiesProvider fallback={<div className="purchase-list">
      <LoadingLabel>Preparando el registro de compras…</LoadingLabel><div className="purchase-list-heading"><Skeleton width="10rem" /></div>
      <TableSkeleton className="purchase-table-scroll" columns={[1, 1, 3, 1, 1, .15]} />
    </div>}>
      {({ secondReviewEnabled }) => <>
        <SheetsSyncStatus />
        {(secondReviewEnabled ? [{ state: 'pending' as const, title: 'Por revisar en Cenit' }, { state: 'reviewed' as const, title: 'Revisados en Cenit' }] : [{ state: 'all' as const, title: 'Compras registradas' }]).map(list => <RequestTable key={list.state} {...list} filters={filters} page={page(list.state)} setPage={value => setPage(list.state, value)} view={view} setPageSize={size => setView('pageSize', String(size))} onYears={receiveYears} valid={valid} searching={changed && !errors.length} returnTo={returnTo} onClearFilters={hasNonDefaultQuickPeriod || activeFilters.length > 0 ? () => remove() : undefined}
          searchAllYears={!allYears && visiblePeriod.year !== 'custom' && !!(filters.q || filters.unitCode || filters.projectCode) ? { year: visiblePeriod.month ? 'el período elegido' : visiblePeriod.year || currentYear, run: () => setPeriod('') } : undefined} />)}
      </>}
    </PurchaseCapabilitiesProvider>
  </section>;
}
