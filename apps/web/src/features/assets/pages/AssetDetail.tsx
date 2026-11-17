import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { ArrowUUpLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowUUpLeft';
import { MapPinIcon } from '@phosphor-icons/react/dist/csr/MapPin';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { HandArrowDownIcon } from '@phosphor-icons/react/dist/csr/HandArrowDown';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import type { AssetDetail as Detail, AssetEvent } from '@cenit/contracts/assets';
import { documentPath, getAsset } from '../api/assets.js';
import { kinds, relativeDue, daysFromToday } from '../model/labels.js';
import { Avatar, BackLink, LoadState, PdfButton, StatusChip, useAssetSummary } from '../components/AssetsUi.js';
import { RelocateButton, ReturnLoanButton } from '../components/Movements.js';
import { displayDate } from '../../../shared/lib/dates.js';
import '../assets.css';

const yesNo = (value: boolean) => value ? 'Sí' : 'No';
function facts(asset: Detail): [string, string | null, boolean?][] {
  const common: [string, string | null, boolean?][] = [['Cantidad', String(asset.quantity)], ['N° de inventario', asset.inventoryNumber]];
  const specific: [string, string | null][] = asset.kind === 'mueble' ? [['Tipo', asset.furnitureType], ['Material', asset.material], ['Medidas', asset.dimensions], ['Adosado al piso o la pared', yesNo(asset.wallMounted)]]
    : asset.kind === 'construccion' ? [['Medidas', asset.area], ['Materiales', asset.material]]
      : [['Marca', asset.brand], ['Modelo', asset.model], ['N° de serie', asset.serialNumber],
        ...(asset.kind === 'equipo_computacional' ? [['Equipo armado', yesNo(asset.assembled)] as [string, string]] : []),
        ...(['equipo', 'maquinaria', 'equipo_computacional'].includes(asset.kind) ? [['Parte de un sistema', yesNo(asset.systemPart)] as [string, string]] : [])];
  return [...specific, ...common, ['Registrado en Cenit', displayDate(asset.registeredOn)], ['Más datos', asset.notes, true]];
}
const eventIcon = { alta: PlusIcon, entrega: CheckIcon, prestamo: ArrowRightIcon, devolucion: ArrowUUpLeftIcon, ubicacion: MapPinIcon, edicion: PencilSimpleIcon };
function eventText(event: AssetEvent) {
  switch (event.kind) {
    case 'alta': return { title: 'Alta en Cenit', detail: [event.locationTo && `Registrado en ${event.locationTo}`, event.person ? `con ${event.person} como responsable` : 'sin responsable'].filter(Boolean).join(', ') };
    case 'entrega': return { title: `Entregado a ${event.person}`, detail: [event.document && `Entrega N° ${event.document.number}`, event.note, event.locationTo && `${event.locationFrom ?? 'Sin ubicación'} → ${event.locationTo}`].filter(Boolean).join(' · ') };
    case 'prestamo': return { title: `Prestado a ${event.person}`, detail: [event.document && `Préstamo N° ${event.document.number}`, event.locationTo, event.note].filter(Boolean).join(' · ') };
    case 'devolucion': return { title: `Devuelto por ${event.person}`, detail: [event.document && `Préstamo N° ${event.document.number}`, event.note].filter(Boolean).join(' · ') };
    case 'ubicacion': return { title: 'Cambió de ubicación', detail: [`${event.locationFrom} → ${event.locationTo}`, event.note].filter(Boolean).join(' · ') };
    default: return { title: 'Datos actualizados', detail: event.note ?? '' };
  }
}

export function AssetDetail() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['assets', 'detail', id], queryFn: ({ signal }) => getAsset(id, signal) });
  const locations = useAssetSummary().data?.locations ?? [];
  const asset = query.data;
  if (!asset) return <section className="assets-page assets-page--doc"><BackLink /><LoadState query={query} label="la ficha del bien" /></section>;
  const Icon = kinds[asset.kind].icon, loan = asset.loan, late = loan?.dueOn ? daysFromToday(loan.dueOn) < 0 : false;
  return <section className="assets-page assets-page--doc">
    <BackLink />
    <header className="assets-heading" style={{ alignItems: 'center' }}>
      <div className="assets-title">
        <span className="assets-kind"><Icon size={26} aria-hidden="true" /></span>
        <div><h1>{asset.description}</h1><p><span className="assets-num">{asset.code}</span>{asset.inventoryNumber && <> · N° inventario <span className="assets-num">{asset.inventoryNumber}</span></>} · {kinds[asset.kind].label}</p></div>
        <StatusChip status={asset.status} />
      </div>
      <div className="assets-actions">
        <PdfButton path={documentPath.alta(asset.id)} fileName={`alta-${asset.code}`}>Descargar formulario de alta</PdfButton>
        {loan ? <ReturnLoanButton loanId={loan.id} number={loan.number} loanedOn={loan.loanedOn} primary /> : <>
          <Link className="cenit-button" to={`/administracion/bienes/prestamos/nuevo?bien=${asset.id}`}>Prestar</Link>
          <Link className="cenit-button cenit-button--primary" to={`/administracion/bienes/entregas/nueva?bien=${asset.id}`}><HandArrowDownIcon size={16} aria-hidden="true" />Entregar a una persona</Link>
        </>}
      </div>
    </header>
    <div className="assets-layout">
      <div className="assets-stack">
        <section className="assets-card" aria-labelledby="asset-data">
          <div className="assets-card__head"><h2 id="asset-data">Datos del bien</h2><Link className="cenit-button cenit-button--quiet" to={`/administracion/bienes/${asset.id}/editar`}><PencilSimpleIcon size={15} aria-hidden="true" />Editar datos</Link></div>
          <dl className="assets-facts">
            {facts(asset).map(([label, value, wide]) => <div key={label} className={wide ? 'assets-facts__wide' : undefined}><dt>{label}</dt><dd className={value ? undefined : 'assets-muted'}>{value ?? 'Sin información'}</dd></div>)}
            <div className="assets-facts__wide"><dt>Compra asociada</dt><dd>{asset.purchase ? <Link to={`/administracion/compras/${asset.purchase.id}`}>{asset.purchase.requestNumber}</Link> : <span className="assets-muted">Sin compra asociada</span>}{asset.purchase && <span className="assets-sub">{asset.purchase.description}</span>}</dd></div>
          </dl>
        </section>
        <section className="assets-card" aria-labelledby="asset-trace">
          <div className="assets-card__head"><h2 id="asset-trace">Historial del bien</h2><span className="assets-sub">{asset.events.length} {asset.events.length === 1 ? 'movimiento' : 'movimientos'}</span></div>
          <ol className="assets-timeline">{asset.events.map(event => {
            const EventIcon = eventIcon[event.kind], text = eventText(event);
            return <li key={event.id}>
              <span className={`assets-dot assets-dot--${event.kind}`}><EventIcon size={15} aria-hidden="true" /></span>
              <div><strong>{text.title}</strong>{text.detail && <p>{text.detail}</p>}
                {event.document && <Link to={`/administracion/bienes/${event.document.type === 'delivery' ? 'entregas' : 'prestamos'}/${event.document.id}`}>{event.document.type === 'delivery' ? 'Ver entrega' : 'Ver préstamo'}</Link>}</div>
              <time dateTime={event.occurredOn} title={`Registrado por ${event.createdBy}`}>{displayDate(event.occurredOn)}</time>
            </li>;
          })}</ol>
        </section>
      </div>
      <aside className="assets-stack">
        <section className="assets-card" aria-labelledby="asset-now">
          <div className="assets-card__head"><h2 id="asset-now">Situación actual</h2></div>
          <dl className="assets-now" style={{ margin: 0 }}>
            <dt>Responsable</dt>
            <dd>{asset.custodian ? <div className="assets-person"><Avatar name={asset.custodian.name} inactive={!asset.custodian.active} /><div><strong>{asset.custodian.name}</strong><span className="assets-sub">{[asset.custodian.position, asset.custodian.unit].filter(Boolean).join(' · ') || 'Sin cargo ni unidad'}</span></div></div> : <span className="assets-muted">Sin responsable</span>}</dd>
            <dt>Ubicación</dt>
            <dd className="assets-location"><span>{asset.location}</span><RelocateButton asset={asset} locations={locations} /></dd>
          </dl>
          {loan && <div className={`assets-alert${late ? ' assets-alert--late' : ''}`}>
            <strong>{late ? `Devolución vencida · ${relativeDue(loan.dueOn).replace('Vencido ', '')}` : 'En préstamo'}</strong>
            <p>Prestado a {loan.borrowerName} desde el {displayDate(loan.loanedOn)}. {loan.dueOn ? `Devolución esperada el ${displayDate(loan.dueOn)}.` : 'Sin fecha de devolución.'}</p>
            <Link className="cenit-button" to={`/administracion/bienes/prestamos/${loan.id}`}>Ver préstamo {loan.number}</Link>
          </div>}
          {asset.custodian && !asset.custodian.active && <div className="assets-alert assets-alert--review">
            <strong>Responsable sin vigencia</strong>
            <p>{asset.custodian.name} ya no pertenece a la institución{asset.custodian.inactiveSince ? ` desde el ${displayDate(asset.custodian.inactiveSince)}` : ''}. Entrega el bien a otra persona para actualizar su responsable.</p>
            {!loan && <Link className="cenit-button" to={`/administracion/bienes/entregas/nueva?desde=${asset.custodian.id}`}>Entregar sus bienes</Link>}
          </div>}
        </section>
        <div className="assets-hint"><InfoIcon size={18} aria-hidden="true" /><span>Para cambiar el responsable usa «Entregar». Para cambiar el lugar usa «Cambiar ubicación». Todo queda anotado en el historial del bien.</span></div>
      </aside>
    </div>
  </section>;
}
