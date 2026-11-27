import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { FunnelSimpleIcon } from '@phosphor-icons/react/dist/csr/FunnelSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ImagesIcon } from '@phosphor-icons/react/dist/csr/Images';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAYMENT_SITUATIONS, validatePurchaseListQuery, type PurchaseFilters, type PurchaseListItem, type PurchaseListQuery } from '@cenit/contracts/purchases';
import { listPurchases } from '../api/purchases.js';
import { PurchaseCapabilitiesProvider } from '../model/capabilities.js';
import { SheetsSyncStatus } from '../components/SheetsSyncStatus.js';
import { PurchaseSheet } from '../components/PurchaseSheet.js';
import { usePaymentToggle } from '../model/payment.js';
import { PurchasePagination } from '../components/PurchasePagination.js';
import { Select } from '../../../shared/components/Select.js';
import { dateLabel, amountLabel, isPaid, sentenceCase, unpaidLabel } from '../model/fields.js';
import { periodRange, selectedPeriod } from '../model/list.js';
import { LoadingLabel, Skeleton, TableSkeleton } from '../../../shared/components/Skeleton.js';
import { useExitPresence } from '../../../shared/lib/use-exit-presence.js';
import { PurchaseDateRangeField } from '../components/PurchaseDateRangeField.js';
import { ExportExcel } from '../components/ExportExcel.js';
import { Combobox } from '../components/Combobox.js';
import { useCatalogOptions } from '../model/catalog.js';
import '../records.css';

const labels = { q: 'Buscar compras', unitCode: 'Unidad', projectCode: 'Proyecto', accountingCode: 'Código Contable' };
const payments = [{ value: '', label: 'Todas', count: 'all' }, { value: PAYMENT_SITUATIONS[0], label: 'Pendientes', count: 'pending' }, { value: PAYMENT_SITUATIONS[1], label: 'Pagadas', count: 'paid' }] as const;
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const currentSantiagoYear = () => new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric' }).format(new Date());
type ListView = Pick<PurchaseListQuery, 'sort' | 'pageSize'>;
type FilterInput = { q: string; dateFrom: string; dateTo: string; unitCode: string; projectCode: string; accountingCode: string };
type CodeField = 'unitCode' | 'projectCode' | 'accountingCode';
type FilterChip = { key: keyof FilterInput | 'period'; label: string };
function RequestTable({ title, filters, page, setPage, view, setPageSize, setSort, onYears, valid, searching, returnTo, onClearFilters, searchAllYears, payment, setPayment, selectedId, onRows }: {
  title: string; filters: PurchaseFilters; page: number; setPage: (page: number) => void; valid: boolean; searching: boolean; returnTo: string;
  onClearFilters?: () => void; searchAllYears?: { year: string; run: () => void };
  view: ListView; setPageSize: (size: number) => void; setSort: (sort: ListView['sort']) => void; onYears: (years: number[] | undefined) => void;
  payment: string; setPayment: (value: string) => void; selectedId?: string; onRows: (ids: string[]) => void;
}) {
  const query = useQuery({ queryKey: ['purchases', 'list', filters, page, view], queryFn: ({ signal }) => listPurchases(page, signal, filters, view), enabled: valid, placeholderData: keepPreviousData });
  const toggle = usePaymentToggle();
  const ids = query.data?.data.map(row => row.id).join(',') ?? '';
  useEffect(() => { onRows(ids ? ids.split(',') : []); }, [ids, onRows]);
  const data = query.data, updating = searching || query.isFetching || query.isPlaceholderData;
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const paymentTrigger = useRef<HTMLButtonElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const hasRows = valid && !query.isError && !!data?.data.length;
  const emptyRegister = data?.availableYears?.length === 0 || Object.keys(filters).length === 0;
  useLayoutEffect(() => {
    const container = scroller.current, table = container?.querySelector('table');
    if (!container || !table) return;
    const measure = () => setOverflowing(container.scrollWidth > container.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, [hasRows]);
  useEffect(() => {
    if (toggle.isPending || !paymentTrigger.current) return;
    if (!paymentTrigger.current.isConnected && document.activeElement === document.body) heading.current?.focus();
    paymentTrigger.current = null;
  }, [toggle.isPending]);
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
  const navigate = useNavigate(), location = useLocation();
  const detail = (id: string) => `/administracion/compras/${id}${location.search}`;
  // The whole row opens the detail for pointer users; keyboard and screen readers use the request-number link.
  function openRow(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if (updating || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target) || target.closest('a, button, input') || window.getSelection()?.toString()) return;
    navigate(detail(id), { state: { purchasesReturnTo: returnTo } });
  }
  const pill = (record: PurchaseListItem) => {
    const paid = isPaid(record.paymentSituation), busy = toggle.isPending && toggle.variables?.id === record.id;
    const action = paid ? 'Volver a pendiente' : 'Marcar como pagado';
    if (record.source === 'contract_example') {
      const label = sentenceCase(record.paymentSituation);
      return <span className="purchase-pill purchase-pill--muted"><span className="purchase-pill__label" title={label}>{label}</span></span>;
    }
    const label = busy ? 'Guardando…' : paid ? 'Pagado' : unpaidLabel(record.paymentSituation);
    return <div className="purchase-pay-action"><button type="button" className={`purchase-pill purchase-pill--${paid ? 'paid' : 'pending'}`} aria-disabled={updating || busy} aria-busy={busy}
      aria-label={`Situación de pago de ${record.requestNumber}: ${busy ? label : `${label.toLocaleLowerCase('es-CL')}. ${action}`}`}
      onClick={event => {
        if (updating || busy) return;
        if (event.currentTarget === document.activeElement) paymentTrigger.current = event.currentTarget;
        toggle.mutate({ id: record.id, version: record.version, paymentSituation: record.paymentSituation, requestNumber: record.requestNumber });
      }}>
      {!busy && (paid ? <CheckIcon size={13} weight="bold" aria-hidden="true" /> : <span className="purchase-pill__dot" aria-hidden="true" />)}
      <span className="purchase-pill__label" title={paid || busy || record.paymentSituation === 'PENDIENTE' ? undefined : label}>{label}</span>
    </button>{!busy && <span className="purchase-pay-action__hint" aria-hidden="true">{action}</span>}</div>;
  };
  return <section className="purchase-list" aria-label={title} aria-busy={updating}>
    <div className="purchase-list-heading"><h2 id="purchase-list-title" ref={heading} tabIndex={-1}>{title}</h2>{data && !query.isError && <><span className="purchase-count">{data.pagination.total} {data.pagination.total === 1 ? 'registro' : 'registros'}</span>{updating && <span className="purchase-updating" role="status">Actualizando resultados…</span>}<span className="purchase-total">Monto · CLP <strong>{amountLabel(data.totals.documentTotal)}</strong></span></>}
      <div className="purchase-segmented purchase-payment-filter" role="group" aria-label="Situación de pago">{payments.map(option => <button key={option.value} type="button" aria-pressed={payment === option.value}
        onClick={() => setPayment(option.value)}>{option.label}{data?.paymentCounts && <span className="purchase-count">{data.paymentCounts[option.count]}</span>}</button>)}</div></div>
    {!valid ? <p className="purchase-state">Corrige los filtros para consultar las compras.</p> : query.isPending ? <><LoadingLabel>Cargando compras…</LoadingLabel><TableSkeleton className="purchase-table-scroll" columns={[1, 1, 2, 3, 1, 1, 1, 1]} /></> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button className="cenit-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div> : data && <>
      {!data.data.length ? <div className="cenit-empty cenit-empty--bordered"><span className="cenit-empty__icon"><MagnifyingGlassIcon size={26} aria-hidden="true" /></span><h3>{page > 1 ? 'Esta página ya no tiene compras' : emptyRegister ? 'Aún no hay compras registradas' : 'No encontramos compras con estos filtros'}</h3><p>{page > 1 ? 'Vuelve al inicio del listado para ver los resultados disponibles.' : emptyRegister ? 'Registra tus capturas de Oracle o la primera compra a mano.' : searchAllYears ? `Sólo se buscó en ${searchAllYears.year}. Prueba en todos los años o con otro número o código.` : 'Prueba con otro período, número o código.'}</p>{page > 1 ? <button className="cenit-button" type="button" disabled={updating} onClick={() => setPage(1)}>Ir a la primera página</button> : !emptyRegister && <div className="cenit-empty__actions">{searchAllYears && <button className="cenit-button cenit-button--primary" type="button" disabled={updating} onClick={() => { heading.current?.focus({ preventScroll: true }); searchAllYears.run(); }}>Buscar en todos los años</button>}{onClearFilters && <button className="cenit-button" type="button" disabled={updating} onClick={onClearFilters}>Quitar filtros</button>}</div>}</div> : <>
      {overflowing && <p id="purchase-table-overflow" className="purchase-table-overflow">Desplaza la tabla para ver las demás columnas.</p>}
      <div ref={scroller} className="purchase-table-scroll" data-overflow={overflowing || undefined} tabIndex={0} role="region" aria-label={`Tabla: ${title}`} aria-describedby={overflowing ? 'purchase-table-overflow' : undefined}><table className="purchase-table--register"><caption className="purchase-sr-only">{title}</caption><thead><tr><th scope="col" aria-sort={view.sort === 'dateAsc' ? 'ascending' : 'descending'}><button type="button" className="purchase-sort-header" disabled={updating}
        aria-label={`Fecha: ${view.sort === 'dateAsc' ? 'más antiguas primero' : 'más recientes primero'}. Cambiar el orden`} onClick={() => setSort(view.sort === 'dateAsc' ? 'dateDesc' : 'dateAsc')}>
        Fecha{view.sort === 'dateAsc' ? <ArrowUpIcon size={13} weight="bold" aria-hidden="true" /> : <ArrowDownIcon size={13} weight="bold" aria-hidden="true" />}</button></th><th scope="col">Nº Documento</th><th scope="col">PROVEEDOR</th><th scope="col">DETALLE</th><th scope="col">Tipo documento</th><th scope="col">Unidad</th><th scope="col" className="purchase-money">Monto</th><th scope="col">Situación de pago</th></tr></thead>
        <tbody>{data.data.map(record => <tr key={record.id} className="purchase-row" aria-selected={record.id === selectedId} onClick={event => openRow(event, record.id)}>
          <td className="purchase-sent-date">{dateLabel(record.recordDate)}</td>
          <th scope="row" className="purchase-request-number"><Link id={`purchase-row-${record.id}`} to={detail(record.id)} aria-disabled={updating} onClick={event => { if (updating) event.preventDefault(); }} state={{ purchasesReturnTo: returnTo }} aria-label={`Abrir la ficha de la compra ${record.requestNumber}`}>{record.requestNumber}</Link></th>
          <td className="purchase-provider"><span>{record.provider ?? 'Sin dato'}</span></td>
          <td className="purchase-description"><span>{record.description}</span>{record.source === 'contract_example' && <span className="purchase-origin-tag">Ejemplo de demostración</span>}</td>
          <td className="purchase-document-type">{record.documentType ? sentenceCase(record.documentType) : 'Sin dato'}</td>
          <td className="purchase-unit">{record.unitCode ?? '—'}</td>
          <td className="purchase-money">{amountLabel(record.totalAmount)}</td>
          <td className="purchase-row-actions">{pill(record)}</td>
        </tr>)}</tbody>
      </table></div>
      </>}
      {data.pagination.total > 0 && <PurchasePagination title={title} page={page} pageSize={data.pagination.pageSize} total={data.pagination.total} updating={updating} setPage={setPage} setPageSize={setPageSize} />}
    </>}
  </section>;
}

export function Purchases() {
  const [params, setParams] = useSearchParams(), location = useLocation(), navigate = useNavigate();
  const { id: selectedId } = useParams();
  const [rows, setRows] = useState<string[]>([]);
  const lastSelected = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId) { lastSelected.current = selectedId; return; }
    if (lastSelected.current === null) return;
    const target = document.getElementById(`purchase-row-${lastSelected.current}`) ?? document.getElementById('purchase-list-title');
    lastSelected.current = null;
    target?.focus();
  }, [selectedId]);
  const readInputs = (): FilterInput => ({ q: params.get('q') ?? '', dateFrom: params.get('dateFrom') ?? '', dateTo: params.get('dateTo') ?? '', unitCode: params.get('unitCode') ?? '', projectCode: params.get('projectCode') ?? '', accountingCode: params.get('accountingCode') ?? '' });
  const [inputs, setInputs] = useState(readInputs), [touched, setTouched] = useState<string[]>([]);
  // Un solo campo de fechas: un día exacto es el mismo día como inicio y fin.
  const inferDateMode = (values: FilterInput) => selectedPeriod(values).year === 'custom' ? 'range' as const : null;
  const [dateMode, setDateMode] = useState<'range' | null>(() => inferDateMode(readInputs()));
  const [expanded, setExpanded] = useState(() => params.has('unitCode') || params.has('accountingCode') || selectedPeriod(readInputs()).year === 'custom');
  const { mounted: filtersMounted, closing: filtersClosing } = useExitPresence(expanded);
  const [availableYears, setAvailableYears] = useState<number[]>();
  const [yearsUnavailable, setYearsUnavailable] = useState(false);
  const [dateWarnings, setDateWarnings] = useState({ range: '' });
  const queryClient = useQueryClient();
  const receiveYears = useCallback((years: number[] | undefined) => { setYearsUnavailable(!years); if (years) setAvailableYears(years); }, []);
  const dateBounds = { minYear: availableYears?.length ? Math.min(...availableYears) : undefined, maxYear: availableYears?.length ? Math.max(...availableYears) : undefined, disabled: !availableYears?.length };
  const dateWarning = dateMode ? dateWarnings[dateMode] : '';
  const sort = params.get('sort') === 'dateAsc' ? 'dateAsc' : 'dateDesc';
  const payment = PAYMENT_SITUATIONS.find(value => value === params.get('paymentSituation')) ?? '';
  const pageSize = [20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const view: ListView = { sort, pageSize }, period = selectedPeriod(inputs);
  const allYears = params.get('allYears') === '1', currentYear = currentSantiagoYear();
  const selected = period.year || allYears ? period : { year: currentYear, month: '' };
  const years = [...new Set([...(availableYears ?? []), ...(selected.year && selected.year !== 'custom' ? [Number(selected.year)] : [])])].sort((a, b) => b - a);
  const resolveDefaultYear = (source: PurchaseFilters) => !allYears && !source.dateFrom && !source.dateTo ? { ...source, ...periodRange(currentYear) } : source;
  const filters = { ...Object.fromEntries(Object.entries(resolveDefaultYear(readInputs())).filter(([, value]) => value !== '')), ...(payment ? { paymentSituation: payment } : {}) } as PurchaseFilters;
  const { unitOptions, projectOptions, accountOptions } = useCatalogOptions(inputs.unitCode || null);
  const codeOptions = { unitCode: unitOptions, projectCode: projectOptions, accountingCode: accountOptions };
  // Un código se aplica cuando es un código (sólo dígitos) o se eligió de la lista; escribir un nombre sólo busca en la lista.
  const codeReady = (field: CodeField, value: string) => !value || /^\d+$/.test(value) || codeOptions[field].some(option => option.value === value);
  const pendingInputs = Object.fromEntries(Object.entries({ ...inputs, q: inputs.q.trim() })
    .filter(([key, value]) => value !== '' && (!(key in codeOptions) || codeReady(key as CodeField, value)))) as PurchaseFilters;
  // La situación de pago se aplica al instante (no pasa por el borrador), pero cuenta en ambos lados para no quedar «actualizando».
  const pending = { ...Object.fromEntries(Object.entries(resolveDefaultYear(pendingInputs)).filter(([, value]) => value !== '')), ...(payment ? { paymentSituation: payment } : {}) } as PurchaseFilters;
  const visibleInputs = readInputs(), visiblePeriod = selectedPeriod(visibleInputs);
  const hasNonDefaultQuickPeriod = allYears || (!!visiblePeriod.year && visiblePeriod.year !== currentYear) || !!visiblePeriod.month;
  const activeFilters: FilterChip[] = (['q', 'projectCode', 'unitCode', 'accountingCode'] as const).flatMap(key => visibleInputs[key] ? [{ key, label: key === 'q' ? visibleInputs.q : `${labels[key]}: ${visibleInputs[key]}` }] : []);
  if (visiblePeriod.year === 'custom') {
    if (visibleInputs.dateFrom && visibleInputs.dateTo && visibleInputs.dateFrom === visibleInputs.dateTo) {
      activeFilters.push({ key: 'period', label: `Fecha: ${dateLabel(visibleInputs.dateFrom)}` });
    } else if (visibleInputs.dateFrom || visibleInputs.dateTo) {
      const from = visibleInputs.dateFrom ? dateLabel(visibleInputs.dateFrom) : 'dd/mm/aaaa';
      const to = visibleInputs.dateTo ? dateLabel(visibleInputs.dateTo) : 'dd/mm/aaaa';
      activeFilters.push({ key: 'period', label: `Rango de fechas: ${from} – ${to}` });
    }
  }
  // Lo que vive en «Más filtros»: se cuenta en el botón y, con el panel cerrado, se muestra como etiqueta que se puede quitar.
  const extraFilters = activeFilters.filter(filter => filter.key !== 'q' && filter.key !== 'projectCode');
  const filterKey = JSON.stringify(filters), pendingKey = JSON.stringify(pending), ownNavigation = useRef<string | null>(null);
  const errors = validatePurchaseListQuery({ ...pending, page: 1, pageSize: 20 });
  if (dateWarning) errors.unshift({ path: '/dateFrom', message: dateWarning });
  if (dateMode === 'range' && (!!inputs.dateFrom !== !!inputs.dateTo) && !errors.length) errors.push({ path: inputs.dateFrom ? '/dateTo' : '/dateFrom', message: 'Completa ambas fechas del rango.' });
  const valid = validatePurchaseListQuery({ ...filters, page: 1, pageSize: 20 }).length === 0;
  const changed = pendingKey !== filterKey, returnTo = `/administracion/compras${location.search}`;
  useEffect(() => {
    if (ownNavigation.current === params.toString()) { ownNavigation.current = null; return; }
    ownNavigation.current = null; setInputs(readInputs()); setDateMode(inferDateMode(readInputs())); setDateWarnings({ range: '' }); setTouched([]);
  }, [filterKey, currentYear]);
  useEffect(() => {
    if (!changed || errors.length) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(Object.entries({ ...pendingInputs, ...(sort === 'dateAsc' ? { sort } : {}), ...(payment ? { paymentSituation: payment } : {}), ...(pageSize !== 20 ? { pageSize: String(pageSize) } : {}) }).map(([key, value]) => [key, String(value)]));
      if (allYears && !pendingInputs.dateFrom && !pendingInputs.dateTo) next.set('allYears', '1');
      ownNavigation.current = next.toString(); setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pendingKey, filterKey, changed, errors.length, sort, pageSize, allYears]);
  function remove(field?: FilterChip['key']) {
    if (!field) {
      setInputs({ q: '', dateFrom: '', dateTo: '', unitCode: '', projectCode: '', accountingCode: '' }); setDateMode(null); setDateWarnings({ range: '' }); setTouched([]);
      setParams(previous => {
        const next = new URLSearchParams(previous);
        for (const key of ['q', 'dateFrom', 'dateTo', 'unitCode', 'projectCode', 'accountingCode', 'allYears', 'page', 'paymentSituation']) next.delete(key);
        ownNavigation.current = next.toString(); return next;
      }, { replace: true });
      return;
    }
    if (field === 'period') { setInputs(previous => ({ ...previous, dateFrom: '', dateTo: '' })); setDateMode(null); }
    else setInputs(previous => ({ ...previous, [field]: '' }));
    setTouched([]);
  }
  function setView(key: 'sort' | 'pageSize' | 'paymentSituation', value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('page');
      if (value === (key === 'sort' ? 'dateDesc' : '20') || (key === 'paymentSituation' && !value)) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
  }
  function setPeriod(year: string, month = '') {
    setInputs(previous => ({ ...previous, ...periodRange(year, month) })); setDateMode(null); setDateWarnings({ range: '' }); setTouched([]);
    if (!year) setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('dateFrom'); next.delete('dateTo'); next.set('allYears', '1');
      next.delete('page');
      ownNavigation.current = next.toString(); return next;
    }, { replace: true });
  }
  const touch = (field: string) => setTouched(previous => previous.includes(field) ? previous : [...previous, field]);
  function search() {
    const id = 'purchase-filter-q', error = touched.includes('q') ? errors.find(problem => problem.path === '/q') : undefined;
    return <div className="purchase-input" key="q"><label htmlFor={id} className="purchase-sr-only">{labels.q}</label><div className="purchase-search-input"><MagnifyingGlassIcon size={18} aria-hidden="true" />
      <input id={id} value={inputs.q} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onBlur={() => touch('q')} className="cenit-input" type="text"
        placeholder="Nº, DETALLE, proveedor o RUT" maxLength={100} onChange={event => setInputs(previous => ({ ...previous, q: event.target.value }))} />
    </div>{error && <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>}</div>;
  }
  // Proyecto va en la barra (es el filtro más usado); unidad y cuenta, en «Más filtros». Se puede elegir del catálogo o escribir un código.
  function code(field: CodeField) {
    const id = `purchase-filter-${field}`, error = touched.includes(field) ? errors.find(problem => problem.path === `/${field}`) : undefined;
    const options = field === 'unitCode' ? unitOptions : field === 'projectCode' ? projectOptions : accountOptions;
    return <div className={`purchase-input purchase-input--${field}`} key={field}><label htmlFor={id} className={field === 'projectCode' ? 'purchase-sr-only' : undefined}>{labels[field]}</label>
      <Combobox id={id} className="cenit-input" aria-label={labels[field]} value={inputs[field]} options={options} maxLength={255} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        placeholder={field === 'projectCode' ? 'Proyecto' : 'Código o nombre'} emptyText="Sin coincidencias en el catálogo. Puedes buscar por lo escrito."
        onBlur={() => touch(field)} onValueChange={value => setInputs(previous => ({ ...previous, [field]: value }))} />
      {error ? <p role="alert" className="purchase-field-error" id={`${id}-error`}>{error.message}</p>
        : !codeReady(field, inputs[field].trim()) && <p className="purchase-field-hint" id={`${id}-hint`}>Elige de la lista o escribe el código.</p>}</div>;
  }
  const dateProblem = errors.find(problem => problem.path === '/dateFrom' || problem.path === '/dateTo');
  const dateError = dateWarning ? { message: dateWarning } : touched.includes('dateFrom') || touched.includes('dateTo') || [inputs.dateFrom, inputs.dateTo].some(value => value.length === 10 && !value.includes('_')) ? dateProblem : undefined;
  const rangeFrom = dateMode === 'range' ? inputs.dateFrom : '';
  const rangeTo = dateMode === 'range' ? inputs.dateTo : '';

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
  const currentPage = (() => { const value = Number(params.get('page') ?? 1); return Number.isSafeInteger(value) && value > 0 ? value : 1; })();
  function setPage(value: number) { setParams(previous => { const next = new URLSearchParams(previous); if (value === 1) next.delete('page'); else next.set('page', String(value)); return next; }); }
  // The export always uses the applied filters, never an unsaved draft in the inputs.
  const appliedPeriod = filters.dateFrom && filters.dateTo ? (filters.dateFrom.endsWith('-01-01') && filters.dateTo === `${filters.dateFrom.slice(0, 4)}-12-31` ? `año ${filters.dateFrom.slice(0, 4)}` : filters.dateFrom === filters.dateTo ? dateLabel(filters.dateFrom) : `${dateLabel(filters.dateFrom)} – ${dateLabel(filters.dateTo)}`) : 'todos los años';
  const appliedDetail = [`Fecha: ${appliedPeriod}`, ...(payment ? [`Situación de pago: ${payment}`] : []), ...activeFilters.filter(filter => filter.key !== 'period').map(filter => filter.key === 'q' ? `Búsqueda: «${filter.label}»` : filter.label)].join(' · ');
  const wholeHistory = { id: 'all', label: 'Todo el historial', detail: 'Todas las compras registradas en Cenit, sin filtros.', filters: {} };
  const exportOptions = Object.keys(filters).length ? [{ id: 'current', label: 'Todos los resultados filtrados', detail: appliedDetail, filters }, wholeHistory] : [wholeHistory];
  return <section className="purchase-records purchase-register"><div className="purchase-page-heading"><div><h1>Registro de compras</h1><p>Una fila por compra, en el mismo orden de tu planilla.</p></div><div className="purchase-heading-actions">
    <ExportExcel options={exportOptions} sort={sort} />
    <Link className="cenit-button" to="/administracion/compras/nueva" state={{ purchasesReturnTo: returnTo }}><PencilSimpleIcon size={16} aria-hidden="true" />Registrar a mano</Link><Link className="cenit-button cenit-button--primary" to="/administracion/compras/captura" state={{ purchasesReturnTo: returnTo }}><ImagesIcon size={18} aria-hidden="true" />Registrar capturas</Link>
  </div></div>
    <form className="purchase-filters" noValidate aria-label="Filtros de solicitudes" onSubmit={event => event.preventDefault()}>
      <div className="purchase-search-bar">{search()}{code('projectCode')}
        <div className="purchase-period-controls">
        <div className="purchase-inline-select purchase-select-year"><Select className="cenit-button purchase-select-trigger" label="Año" placeholder="Año" value={selected.year} onValueChange={value => setPeriod(value, selected.month)} options={[{ value: '', label: 'Todos los años' }, ...(selected.year === 'custom' ? [{ value: 'custom', label: 'Rango personalizado', disabled: true }] : []), ...years.map(year => ({ value: String(year).padStart(4, '0'), label: String(year) }))]} /></div>
        <div className="purchase-inline-select purchase-select-month"><Select className="cenit-button purchase-select-trigger" label="Mes" placeholder="Mes" value={selected.month} disabled={!selected.year || selected.year === 'custom'} onValueChange={value => setPeriod(selected.year, value)} options={[{ value: '', label: 'Todos los meses' }, ...months.map((month, index) => ({ value: String(index + 1).padStart(2, '0'), label: month }))]} /></div>
        <button className="cenit-button purchase-filter-toggle" type="button" aria-expanded={expanded} aria-controls={filtersMounted ? 'purchase-more-filters' : undefined} onClick={() => setExpanded(value => !value)}><FunnelSimpleIcon size={18} aria-hidden="true" />Más filtros{extraFilters.length > 0 && <span className="purchase-count">{extraFilters.length}</span>}</button>
        <button disabled={!(hasNonDefaultQuickPeriod || activeFilters.length > 0 || changed || dateWarning || payment)} className="cenit-button purchase-clear-period" type="button" onClick={() => remove()}>Limpiar</button>
        </div>
      </div>
      {filtersMounted && <div id="purchase-more-filters" className={`purchase-filter-extra${filtersClosing ? ' purchase-filter-extra--closing' : ''}`} aria-hidden={filtersClosing || undefined} inert={filtersClosing || undefined}><div className="purchase-filter-extra__clip"><div className="purchase-filter-extra__content"><div className="purchase-filter-grid">{dateRangeField()}{code('unitCode')}{code('accountingCode')}</div></div></div></div>}
      {expanded && !availableYears?.length && <p className="purchase-filter-feedback">{yearsUnavailable ? 'No se pudieron cargar los años del historial.' : availableYears ? 'Las fechas estarán disponibles cuando haya compras registradas.' : 'Cargando años del historial…'}{yearsUnavailable && <button className="cenit-button" type="button" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['purchases', 'list'] }); }}>Reintentar</button>}</p>}
      {!expanded && extraFilters.length > 0 && <div className="purchase-filter-chips" aria-label="Filtros activos">{extraFilters.map(filter => <button className="cenit-button" type="button" key={filter.key} aria-label={`Quitar filtro: ${filter.label}`} onClick={() => remove(filter.key)}>{filter.label}<XIcon size={14} aria-hidden="true" /></button>)}</div>}
    </form>
    <PurchaseCapabilitiesProvider fallback={<div className="purchase-list">
      <LoadingLabel>Preparando el registro de compras…</LoadingLabel><div className="purchase-list-heading"><Skeleton width="10rem" /></div>
      <TableSkeleton className="purchase-table-scroll" columns={[1, 1, 2, 3, 1, 1, 1, 1]} />
    </div>}>
      {() => <>
        <SheetsSyncStatus />
        <RequestTable title="Compras registradas" filters={filters} page={currentPage} setPage={setPage} view={view} setPageSize={size => setView('pageSize', String(size))} setSort={value => setView('sort', value ?? 'dateDesc')} onYears={receiveYears} valid={valid} searching={changed && !errors.length} returnTo={returnTo}
          onClearFilters={hasNonDefaultQuickPeriod || activeFilters.length > 0 || payment ? () => remove() : undefined} payment={payment} setPayment={value => setView('paymentSituation', value)}
          selectedId={selectedId} onRows={setRows}
          searchAllYears={!allYears && visiblePeriod.year !== 'custom' && !!(filters.q || filters.unitCode || filters.projectCode || filters.accountingCode) ? { year: visiblePeriod.month ? 'el período elegido' : visiblePeriod.year || currentYear, run: () => setPeriod('') } : undefined} />
        {selectedId && <PurchaseSheet id={selectedId} neighbours={rows} returnTo={returnTo}
          onNavigate={next => navigate(`/administracion/compras/${next}${location.search}`, { replace: true, state: { purchasesReturnTo: returnTo } })}
          onClose={deleted => {
            if (deleted) lastSelected.current = '';
            navigate(returnTo, { replace: true });
          }} />}
      </>}
    </PurchaseCapabilitiesProvider>
  </section>;
}
