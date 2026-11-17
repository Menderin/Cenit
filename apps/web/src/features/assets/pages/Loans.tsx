import { Link, useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import type { LoanStatus } from '@cenit/contracts/assets';
import { documentPath, getLoan, listLoans } from '../api/assets.js';
import { relativeDue, daysFromToday } from '../model/labels.js';
import { AssetsHeader, BackLink, LoadState, LoanChip, PdfButton } from '../components/AssetsUi.js';
import { PersonCard } from '../components/Pickers.js';
import { ItemsTable } from '../components/Documents.js';
import { ReturnLoanButton } from '../components/Movements.js';
import { rowOpener, useListParams } from './Deliveries.js';
import { PurchasePagination } from '../../purchases/components/PurchasePagination.js';
import { displayDate, displayInstantDate } from '../../../shared/lib/dates.js';
import '../assets.css';
import '../../purchases/records.css';

const tabs: { value: LoanStatus | 'all' | 'abierto'; label: string }[] = [{ value: 'abierto', label: 'Por devolver' }, { value: 'vencido', label: 'Vencidos' }, { value: 'devuelto', label: 'Devueltos' }, { value: 'all', label: 'Todos' }];

export function Loans() {
  const list = useListParams(), navigate = useNavigate(), open = rowOpener(navigate);
  const view = tabs.some(tab => tab.value === list.params.get('estado')) ? list.params.get('estado') as typeof tabs[number]['value'] : 'abierto';
  // «Por devolver» reúne activos y vencidos; el servidor ordena primero los de devolución más próxima o vencida.
  const filters = { q: list.q || undefined, status: view, page: list.page, pageSize: list.pageSize };
  const query = useQuery({ queryKey: ['assets', 'loans', filters], queryFn: ({ signal }) => listLoans(filters, signal), placeholderData: keepPreviousData });
  const data = query.data, rows = data?.data ?? [];
  const counts = data?.counts, count = (value: typeof view) => !counts ? undefined : value === 'abierto' ? counts.activo + counts.vencido : value === 'all' ? counts.activo + counts.vencido + counts.devuelto : counts[value];
  return <section className="assets-page purchase-records">
    <AssetsHeader actions={<Link className="cenit-button cenit-button--primary" to="/administracion/bienes/prestamos/nuevo"><PlusIcon size={16} aria-hidden="true" />Nuevo préstamo</Link>} />
    <div className="assets-toolbar">
      <div className="assets-segmented" role="group" aria-label="Mostrar préstamos">{tabs.map(tab => <button key={tab.value} type="button" aria-pressed={view === tab.value}
        onClick={() => list.update({ estado: tab.value === 'abierto' ? undefined : tab.value })}>{tab.label}{count(tab.value) !== undefined && <span className={`assets-count${tab.value === 'vencido' && count('vencido') ? ' assets-count--late' : ''}`}>{count(tab.value)}</span>}</button>)}</div>
      <label className="assets-search" role="search"><span className="assets-sr">Buscar préstamos</span><MagnifyingGlassIcon size={16} aria-hidden="true" />
        <input className="cenit-input" type="search" value={list.text} onChange={event => list.setText(event.target.value)} placeholder="Número, persona o bien" autoComplete="off" /></label>
    </div>
    <LoadState query={query} label="los préstamos" />
    {data && !query.isError && (!rows.length ? <div className="cenit-empty cenit-empty--bordered"><span className="cenit-empty__icon"><ArrowsLeftRightIcon size={26} aria-hidden="true" /></span>
      <h3>{list.q ? 'No encontramos préstamos con esa búsqueda' : view === 'vencido' ? 'No hay préstamos vencidos' : view === 'abierto' ? 'No hay préstamos por devolver' : 'Aún no hay préstamos'}</h3>
      <p>{view === 'vencido' || view === 'abierto' ? 'Todo lo prestado ya fue devuelto.' : 'Cuando prestes un bien, aparecerá aquí hasta su devolución.'}</p></div> : <>
      <div className="assets-table-wrap"><table className="assets-table assets-loans assets-uniform"><caption className="assets-sr">Préstamos</caption>
        <thead><tr><th scope="col">N°</th><th scope="col">Bien</th><th scope="col">Prestado a</th><th scope="col">Desde</th><th scope="col">Devolución</th><th scope="col">Estado</th><th scope="col"><span className="assets-sr">Acciones</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} data-href onClick={event => open(event, `/administracion/bienes/prestamos/${row.id}`)}>
          <th scope="row"><Link className="assets-num" to={`/administracion/bienes/prestamos/${row.id}`}>{row.number}</Link></th>
          <td title={row.items.map(item => `${item.code} · ${item.description}`).join('\n')}><span className="assets-clip">{row.items[0]?.description}{row.items.length > 1 && ` y ${row.items.length - 1} más`}</span><span className="assets-sub assets-clip">{[row.items[0]?.code, row.items[0]?.brand, row.items[0]?.model].filter(Boolean).join(' · ')}</span></td>
          <td title={[row.borrowerName, row.borrowerUnit].filter(Boolean).join(' · ')}><span className="assets-clip">{row.borrowerName}</span><span className="assets-sub assets-clip"><span className="assets-narrow-hide">{row.borrowerUnit ?? 'Sin unidad'}</span><span className="assets-narrow-only">Desde el {displayDate(row.loanedOn)}</span></span></td>
          <td className="assets-num">{displayDate(row.loanedOn)}</td>
          <td className="assets-num">{row.returnedOn ? <>Devuelto el {displayDate(row.returnedOn)}</> : row.dueOn ? <>{displayDate(row.dueOn)}<span className={`assets-sub${daysFromToday(row.dueOn) < 0 ? ' assets-due--late' : ''}`}>{relativeDue(row.dueOn)}</span></> : <span className="assets-muted">Sin fecha</span>}</td>
          <td><LoanChip status={row.status} /></td>
          <td className="assets-actions-cell">{row.status !== 'devuelto' && <ReturnLoanButton small loanId={row.id} number={row.number} loanedOn={row.loanedOn} />}</td>
        </tr>)}</tbody></table></div>
      <PurchasePagination title="Préstamos" page={list.page} pageSize={list.pageSize} total={data.pagination.total} updating={query.isFetching}
        setPage={value => list.update({ pagina: String(value) })} setPageSize={value => list.update({ porPagina: String(value) })} />
    </>)}
  </section>;
}

export function LoanDetail() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['assets', 'loan', id], queryFn: ({ signal }) => getLoan(id, signal) });
  const loan = query.data;
  if (!loan) return <section className="assets-page assets-page--doc"><BackLink to="/administracion/bienes/prestamos">Volver a Préstamos</BackLink><LoadState query={query} label="el préstamo" /></section>;
  return <section className="assets-page assets-page--doc">
    <BackLink to="/administracion/bienes/prestamos">Volver a Préstamos</BackLink>
    <header className="assets-heading" style={{ alignItems: 'center' }}>
      <div className="assets-title"><div><h1>Préstamo N° {loan.number}</h1><p>Prestado el {displayDate(loan.loanedOn)}.</p></div><LoanChip status={loan.status} /></div>
      <div className="assets-actions">
        <PdfButton path={documentPath.loan(loan.id)} fileName={`prestamo-${loan.number.replace('/', '-')}`}>Descargar documento para firmar</PdfButton>
        {loan.status !== 'devuelto' && <ReturnLoanButton primary loanId={loan.id} number={loan.number} loanedOn={loan.loanedOn} />}
      </div>
    </header>
    {loan.status === 'vencido' && loan.dueOn && <div className="assets-alert assets-alert--late" style={{ marginTop: 0, marginBottom: 16 }}><strong>La devolución está vencida</strong><p>Se esperaba el {displayDate(loan.dueOn)} ({relativeDue(loan.dueOn).toLocaleLowerCase('es')}). Contacta a {loan.borrower.name} o registra la devolución si ya volvió.</p></div>}
    <div className="assets-layout">
      <div className="assets-stack">
        <section className="assets-card"><div className="assets-card__head"><h2>Bienes prestados</h2></div><ItemsTable items={loan.items.map(item => ({ key: item.assetId, ...item }))} /></section>
        <section className="assets-card"><div className="assets-card__head"><h2>Detalle</h2></div>
          <dl className="assets-facts">
            <div><dt>Devolución esperada</dt><dd>{loan.dueOn ? displayDate(loan.dueOn) : <span className="assets-muted">Sin fecha</span>}</dd></div>
            <div><dt>Devuelto</dt><dd>{loan.returnedOn ? displayDate(loan.returnedOn) : <span className="assets-muted">Aún no</span>}{loan.returnNote && <span className="assets-sub">{loan.returnNote}</span>}</dd></div>
            <div><dt>¿Dónde se usa?</dt><dd className={loan.location ? undefined : 'assets-muted'}>{loan.location ?? 'Sin información'}</dd></div>
            <div><dt>Autoriza</dt><dd>{loan.authorizerName}<span className="assets-sub">{loan.authorizerUnit}</span></dd></div>
            <div><dt>Registrado en Cenit</dt><dd>{displayInstantDate(loan.createdAt)}<span className="assets-sub">por {loan.createdBy}</span></dd></div>
            {loan.notes && <div className="assets-facts__wide"><dt>Observaciones</dt><dd>{loan.notes}</dd></div>}
          </dl></section>
      </div>
      <aside className="assets-stack"><section className="assets-card"><div className="assets-card__head"><h2>Recibe el préstamo</h2></div><PersonCard person={loan.borrower} /></section></aside>
    </div>
  </section>;
}
