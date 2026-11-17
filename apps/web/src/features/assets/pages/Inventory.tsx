import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { assetKinds, assetStatuses, type AssetKind, type AssetStatus } from '@cenit/contracts/assets';
import { listAssets, listPeople } from '../api/assets.js';
import { brandLine, kinds, statuses } from '../model/labels.js';
import { AssetsHeader, LoadState, StatusChip } from '../components/AssetsUi.js';
import { Select } from '../../../shared/components/Select.js';
import { PurchasePagination } from '../../purchases/components/PurchasePagination.js';
import '../assets.css';
import '../../purchases/records.css';

// Inventario con búsqueda por palabras clave; los filtros viven en la URL para volver al mismo listado.
export function Inventory() {
  const [params, setParams] = useSearchParams(), navigate = useNavigate();
  const [text, setText] = useState(params.get('q') ?? '');
  const kind = assetKinds.includes(params.get('tipo') as AssetKind) ? params.get('tipo') as AssetKind : undefined;
  const status = assetStatuses.includes(params.get('estado') as AssetStatus) ? params.get('estado') as AssetStatus : undefined;
  const custodianId = params.get('responsable') ?? undefined, q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1), pageSize = [20, 50, 100].includes(Number(params.get('porPagina'))) ? Number(params.get('porPagina')) : 20;
  const update = (changes: Record<string, string | undefined>) => setParams(current => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    if (!('pagina' in changes)) next.delete('pagina');
    return next;
  }, { replace: true });
  useEffect(() => { setText(current => current.trim() === q ? current : q); }, [q]);
  useEffect(() => {
    const value = text.trim();
    if (value === q) return;
    const timer = window.setTimeout(() => update({ q: value || undefined }), 250);
    return () => window.clearTimeout(timer);
  }, [text]);
  const filters = { q: q || undefined, kind, status, custodianId, page, pageSize };
  const query = useQuery({ queryKey: ['assets', 'list', filters], queryFn: ({ signal }) => listAssets(filters, signal), placeholderData: keepPreviousData });
  const custodian = useQuery({ queryKey: ['assets', 'people', 'all'], queryFn: ({ signal }) => listPeople({}, signal), enabled: !!custodianId });
  const custodianName = custodian.data?.find(person => person.id === custodianId)?.name;
  const data = query.data, filtered = !!(q || kind || status || custodianId);
  function open(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if (event.button || event.metaKey || event.ctrlKey || (event.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return;
    navigate(`/administracion/bienes/${id}`);
  }
  return <section className="assets-page purchase-records">
    <AssetsHeader />
    <div className="assets-toolbar" role="search">
      <label className="assets-search"><span className="assets-sr">Buscar bienes</span><MagnifyingGlassIcon size={16} aria-hidden="true" />
        <input className="cenit-input" type="search" value={text} onChange={event => setText(event.target.value)} placeholder="Código, N° inventario, serie, descripción, marca, responsable o ubicación" autoComplete="off" /></label>
      <Select label="Tipo de bien" value={kind ?? ''} onValueChange={value => update({ tipo: value || undefined })} options={[{ value: '', label: 'Todos los tipos' }, ...assetKinds.map(value => ({ value, label: kinds[value].label }))]} />
      <Select label="Estado" value={status ?? ''} onValueChange={value => update({ estado: value || undefined })} options={[{ value: '', label: 'Todos los estados' }, ...assetStatuses.map(value => ({ value, label: statuses[value].label }))]} />
    </div>
    {(custodianId || filtered) && <div className="assets-chips">
      {custodianId && <button type="button" onClick={() => update({ responsable: undefined })} aria-label="Quitar filtro de responsable">Responsable: {custodianName ?? '…'}<XIcon size={12} aria-hidden="true" /></button>}
      {filtered && <button type="button" onClick={() => { setText(''); setParams({}, { replace: true }); }}>Limpiar filtros<XIcon size={12} aria-hidden="true" /></button>}
    </div>}
    {query.isFetching && !query.isPending && <p className="assets-updating" role="status">Actualizando resultados…</p>}
    <LoadState query={query} label="el inventario" />
    {data && !query.isError && (!data.data.length ? <div className="cenit-empty cenit-empty--bordered">
      <span className="cenit-empty__icon">{filtered ? <MagnifyingGlassIcon size={26} aria-hidden="true" /> : <PackageIcon size={26} aria-hidden="true" />}</span>
      <h3>{filtered ? 'No encontramos bienes con estos filtros' : 'Aún no hay bienes registrados'}</h3>
      <p>{filtered ? 'Prueba con otra palabra: serie, marca, ubicación o el nombre del responsable.' : 'Registra el primer bien para empezar su trazabilidad.'}</p>
      {filtered ? <button type="button" className="cenit-button" onClick={() => { setText(''); setParams({}, { replace: true }); }}>Quitar filtros</button>
        : <Link className="cenit-button cenit-button--primary" to="/administracion/bienes/nuevo">Registrar bien</Link>}
    </div> : <>
      <div className="assets-table-wrap"><table className="assets-table assets-inventory assets-uniform">
        <caption className="assets-sr">Inventario de bienes</caption>
        <thead><tr><th scope="col">Código</th><th scope="col">Bien</th><th scope="col">N° de serie</th><th scope="col">Responsable</th><th scope="col">Ubicación</th><th scope="col">Estado</th><th aria-hidden="true" className="assets-caret" /></tr></thead>
        <tbody>{data.data.map(asset => <tr key={asset.id} data-href onClick={event => open(event, asset.id)}>
          <th scope="row"><Link to={`/administracion/bienes/${asset.id}`} className="assets-num">{asset.code}</Link>{asset.inventoryNumber && <span className="assets-sub assets-num" title="N° de inventario">{asset.inventoryNumber}</span>}</th>
          <td title={[asset.description, brandLine(asset), asset.serialNumber && `N° de serie ${asset.serialNumber}`].filter(Boolean).join('\n')}><span className="assets-clip">{asset.description}{asset.quantity > 1 && ` (× ${asset.quantity})`}</span><span className="assets-sub assets-clip">{brandLine(asset)}{asset.serialNumber && <span className="assets-serial-inline"> · Serie {asset.serialNumber}</span>}</span></td>
          <td className="assets-num">{asset.serialNumber ?? <span className="assets-muted">{['mueble', 'construccion'].includes(asset.kind) ? 'No aplica' : 'Sin dato'}</span>}</td>
          <td title={asset.custodian ? `${asset.custodian.name}${asset.custodian.unit ? ` · ${asset.custodian.unit}` : ''}` : undefined}>{asset.custodian ? <><span className="assets-holder assets-clip">{!asset.custodian.active && <WarningIcon size={14} aria-label="Ya no pertenece a la institución" />}{asset.custodian.name}</span>
            <span className="assets-sub assets-clip">{asset.custodian.active ? asset.custodian.unit ?? 'Sin unidad' : 'Ya no pertenece'}</span></> : <span className="assets-muted">Sin responsable</span>}</td>
          <td title={asset.location}><span className="assets-clip">{asset.location}</span></td>
          <td title={asset.loan ? `Prestado a ${asset.loan.borrowerName}` : undefined}><StatusChip status={asset.status} />{asset.loan && <span className="assets-sub assets-clip">a {asset.loan.borrowerName}</span>}</td>
          <td aria-hidden="true" className="assets-caret"><CaretRightIcon size={16} /></td>
        </tr>)}</tbody>
      </table></div>
      <PurchasePagination title="Inventario" page={page} pageSize={pageSize} total={data.pagination.total} updating={query.isFetching}
        setPage={value => update({ pagina: String(value) })} setPageSize={value => update({ porPagina: String(value) })} />
    </>)}
  </section>;
}
