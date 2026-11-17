import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { HandArrowDownIcon } from '@phosphor-icons/react/dist/csr/HandArrowDown';
import { documentPath, getDelivery, listDeliveries } from '../api/assets.js';
import { BackLink, LoadState, PdfButton } from '../components/AssetsUi.js';
import { PersonCard } from '../components/Pickers.js';
import { ItemsTable } from '../components/Documents.js';
import { PurchasePagination } from '../../purchases/components/PurchasePagination.js';
import { displayDate, displayInstantDate } from '../../../shared/lib/dates.js';
import '../assets.css';
import '../../purchases/records.css';

/** Búsqueda con espera de 250 ms y página en la URL, compartida por los listados de documentos. */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '', [text, setText] = useState(q);
  const page = Math.max(1, Number(params.get('pagina')) || 1), pageSize = [20, 50, 100].includes(Number(params.get('porPagina'))) ? Number(params.get('porPagina')) : 20;
  const update = (changes: Record<string, string | undefined>) => setParams(current => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    if (!('pagina' in changes)) next.delete('pagina');
    return next;
  }, { replace: true });
  useEffect(() => { setText(current => current.trim() === q ? current : q); }, [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = window.setTimeout(() => update({ q: text.trim() || undefined }), 250);
    return () => window.clearTimeout(timer);
  }, [text]);
  return { params, q, text, setText, page, pageSize, update };
}
export function rowOpener(navigate: (to: string) => void) {
  return (event: MouseEvent<HTMLTableRowElement>, to: string) => {
    // Un portal (confirmación anclada) burbujea hacia la fila en React aunque no esté dentro de ella en el DOM.
    const target = event.target as HTMLElement;
    if (event.button || event.metaKey || event.ctrlKey || !event.currentTarget.contains(target) || target.closest('a, button') || window.getSelection()?.toString()) return;
    navigate(to);
  };
}

export function Deliveries() {
  const list = useListParams(), navigate = useNavigate(), open = rowOpener(navigate);
  const filters = { q: list.q || undefined, page: list.page, pageSize: list.pageSize };
  const query = useQuery({ queryKey: ['assets', 'deliveries', filters], queryFn: ({ signal }) => listDeliveries(filters, signal), placeholderData: keepPreviousData });
  const data = query.data;
  return <>
    <div className="assets-toolbar" role="search"><label className="assets-search"><span className="assets-sr">Buscar entregas</span><MagnifyingGlassIcon size={16} aria-hidden="true" />
      <input className="cenit-input" type="search" value={list.text} onChange={event => list.setText(event.target.value)} placeholder="Número, persona que recibe, motivo o bien" autoComplete="off" /></label></div>
    <LoadState query={query} label="las entregas" />
    {data && !query.isError && (!data.data.length ? <div className="cenit-empty cenit-empty--bordered"><span className="cenit-empty__icon"><HandArrowDownIcon size={26} aria-hidden="true" /></span>
      <h3>{list.q ? 'No encontramos entregas con esa búsqueda' : 'Aún no hay entregas'}</h3><p>{list.q ? 'Prueba con el nombre de la persona o la descripción del bien.' : 'Cuando entregues un bien a una persona, el acta quedará aquí.'}</p>
      {!list.q && <Link className="cenit-button cenit-button--primary" to="/administracion/bienes/entregas/nueva">Nueva entrega</Link>}</div> : <>
      <div className="assets-table-wrap"><table className="assets-table assets-deliveries assets-uniform"><caption className="assets-sr">Entregas</caption>
        <thead><tr><th scope="col">N°</th><th scope="col">Fecha</th><th scope="col">Recibe</th><th scope="col">Bienes</th><th scope="col">Motivo</th><th aria-hidden="true" className="assets-caret" /></tr></thead>
        <tbody>{data.data.map(row => <tr key={row.id} data-href onClick={event => open(event, `/administracion/bienes/entregas/${row.id}`)}>
          <th scope="row"><Link className="assets-num" to={`/administracion/bienes/entregas/${row.id}`}>{row.number}</Link></th>
          <td className="assets-num">{displayDate(row.deliveredOn)}</td>
          <td title={[row.receiverName, row.receiverUnit].filter(Boolean).join(' · ')}><span className="assets-clip">{row.receiverName}</span><span className="assets-sub assets-clip">{row.receiverUnit ?? 'Sin unidad'}</span></td>
          <td title={row.items.join(', ')}><span className="assets-clip">{row.items.join(', ')}{row.itemCount > row.items.length && ` y ${row.itemCount - row.items.length} más`}</span><span className="assets-sub">{row.itemCount} {row.itemCount === 1 ? 'bien' : 'bienes'}</span></td>
          <td title={row.reason}><span className="assets-clip">{row.reason}</span></td>
          <td aria-hidden="true" className="assets-caret"><CaretRightIcon size={16} /></td>
        </tr>)}</tbody></table></div>
      <PurchasePagination title="Entregas" page={list.page} pageSize={list.pageSize} total={data.pagination.total} updating={query.isFetching}
        setPage={value => list.update({ pagina: String(value) })} setPageSize={value => list.update({ porPagina: String(value) })} />
    </>)}
  </>;
}

export function DeliveryDetail() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['assets', 'delivery', id], queryFn: ({ signal }) => getDelivery(id, signal) });
  const delivery = query.data;
  if (!delivery) return <section className="assets-page assets-page--doc"><BackLink to="/administracion/bienes/entregas">Volver a Entregas</BackLink><LoadState query={query} label="la entrega" /></section>;
  return <section className="assets-page assets-page--doc">
    <BackLink to="/administracion/bienes/entregas">Volver a Entregas</BackLink>
    <header className="assets-heading"><div><h1>Entrega N° {delivery.number}</h1><p>Entregada el {displayDate(delivery.deliveredOn)}. Imprime el acta y pide las firmas; Cenit no guarda el papel firmado.</p></div>
      <div className="assets-actions"><PdfButton primary path={documentPath.delivery(delivery.id)} fileName={`entrega-${delivery.number.replace('/', '-')}`}>Descargar acta para firmar</PdfButton></div></header>
    <div className="assets-layout">
      <div className="assets-stack">
        <section className="assets-card"><div className="assets-card__head"><h2>Bienes entregados</h2><span className="assets-sub">{delivery.items.length} {delivery.items.length === 1 ? 'bien' : 'bienes'}</span></div>
          <ItemsTable items={delivery.items.map(item => ({ key: item.assetId, ...item }))} /></section>
        <section className="assets-card"><div className="assets-card__head"><h2>Detalle</h2></div>
          <dl className="assets-facts">
            <div className="assets-facts__wide"><dt>Motivo</dt><dd>{delivery.reason}</dd></div>
            <div><dt>Nueva ubicación</dt><dd className={delivery.destination ? undefined : 'assets-muted'}>{delivery.destination ?? 'Conservaron su ubicación'}</dd></div>
            <div><dt>Entrega</dt><dd>{delivery.giverName}<span className="assets-sub">{[delivery.giverPosition, delivery.giverUnit].filter(Boolean).join(' · ')}</span></dd></div>
            <div><dt>Registrada en Cenit</dt><dd>{displayInstantDate(delivery.createdAt)}<span className="assets-sub">por {delivery.createdBy}</span></dd></div>
            {delivery.notes && <div className="assets-facts__wide"><dt>Observaciones</dt><dd>{delivery.notes}</dd></div>}
          </dl></section>
      </div>
      <aside className="assets-stack"><section className="assets-card"><div className="assets-card__head"><h2>Recibe conforme</h2></div><PersonCard person={delivery.receiver} /></section></aside>
    </div>
  </section>;
}
