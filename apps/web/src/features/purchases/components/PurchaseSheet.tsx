import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { formatRut, lineFieldLabels, splitChargeAccount, type PurchaseRecord } from '@cenit/contracts/purchases';
import { getPurchase, getPurchaseCatalog } from '../api/purchases.js';
import { usePaymentToggle } from '../model/payment.js';
import { usePurchaseDialog } from '../model/dialog.js';
import { amountLabel, dateLabel, isPaid, oracleLabels, recordLabels, unpaidLabel } from '../model/fields.js';
import { displayDateTime } from '../../../shared/lib/dates.js';
import { Skeleton } from '../../../shared/components/Skeleton.js';
import { DeleteRecord } from './DeleteRecord.js';
import { PurchaseReadError } from './PurchaseReadError.js';
import { SheetsSyncStatus } from './SheetsSyncStatus.js';

// La cuenta de cargo completa sólo se muestra tal como la trae una línea de Oracle con los mismos códigos de la compra.
const chargeAccount = ({ record, lines }: PurchaseRecord) => lines.find(line => {
  const parts = splitChargeAccount(line.chargeAccount);
  return parts?.unitCode === record.unitCode && parts.projectCode === record.projectCode && parts.accountingCode === record.accountingCode;
})?.chargeAccount ?? null;
const source = (record: PurchaseRecord) => record.source === 'image_capture' ? 'Desde una captura revisada' : record.source === 'manual' ? 'Registrada a mano' : 'Ejemplo de demostración';

/**
 * Ficha de una compra: se abre sobre el registro, desde la derecha y con el fondo oscurecido, como el detalle de una asignatura.
 * Primero lo que importa para revisar (proveedor, monto, pago, detalle y cuenta de cargo); lo de Oracle queda plegado al final.
 */
export function PurchaseSheet({ id, neighbours, onNavigate, onClose, returnTo }: {
  id: string; neighbours: string[]; onNavigate: (id: string) => void; onClose: (deleted?: boolean) => void; returnTo: string;
}) {
  const { dialog, closing, close } = usePurchaseDialog();
  const heading = useRef<HTMLHeadingElement>(null);
  const header = useRef<HTMLElement>(null);
  const [previousHeaderHeight, setPreviousHeaderHeight] = useState<number>();
  const query = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: ({ signal }) => getPurchase(id, signal) });
  const catalog = useQuery({ queryKey: ['purchases', 'catalog'], queryFn: ({ signal }) => getPurchaseCatalog(signal), staleTime: Infinity });
  const payment = usePaymentToggle();
  const paymentPending = payment.isPending && payment.variables?.id === id;
  const record = query.isError ? undefined : query.data?.data;
  const loading = !record && !query.isError;
  const contentKey = record ? id : `loading-${id}`;
  const transition = previousHeaderHeight !== undefined && record ? 'purchase-sheet__change' : undefined;
  const index = neighbours.indexOf(id);
  const go = (step: number) => {
    const next = neighbours[index + step];
    if (!next) return;
    setPreviousHeaderHeight(header.current?.getBoundingClientRect().height);
    onNavigate(next);
  };
  const name = (list: 'units' | 'projects' | 'accounts', code: string | null) => code ? (catalog.data?.data[list] as { code: string; name: string; unitCode?: string }[] | undefined)
    ?.find(item => item.code === code && (list !== 'projects' || !record?.record.unitCode || item.unitCode === record.record.unitCode))?.name ?? null : null;
  const fact = (label: string, value: string | null, detail?: string | null) => <div><dt>{label}</dt><dd className={value === null ? 'purchase-sheet__empty' : undefined}>
    <span>{value ?? 'Sin dato'}</span>{detail && <small>{detail}</small>}</dd></div>;
  const paid = record ? isPaid(record.record.paymentSituation) : false;

  return <dialog ref={dialog} className={`purchase-sheet${closing ? ' purchase-sheet--closing' : ''}`} aria-labelledby="purchase-sheet-title" onClose={() => onClose()}
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="purchase-sheet__surface" inert={closing}>
      <header className="purchase-sheet__header" ref={header} style={loading ? { minHeight: previousHeaderHeight } : undefined}>
        <div className="purchase-sheet__bar">
          <p className="purchase-sheet__eyebrow" role="status">{record ? <>Solicitud {record.record.requestNumber} · Fecha {dateLabel(record.record.recordDate)}{record.record.documentType ? ` · ${record.record.documentType}` : ''}</> : loading && <><span className="purchase-sr-only">Cargando la compra…</span><Skeleton className="purchase-sheet__placeholder" width="16rem" height="18px" /></>}</p>
          {neighbours.length > 1 && index >= 0 && <div className="purchase-sheet__nav" role="group" aria-label="Recorrer las compras de esta página">
            <button type="button" className="cenit-button cenit-button--icon" aria-label="Compra anterior" aria-disabled={index <= 0} onClick={() => go(-1)}><CaretLeftIcon size={16} aria-hidden="true" /></button>
            <span>{index + 1} de {neighbours.length}</span>
            <button type="button" className="cenit-button cenit-button--icon" aria-label="Compra siguiente" aria-disabled={index >= neighbours.length - 1} onClick={() => go(1)}><CaretRightIcon size={16} aria-hidden="true" /></button>
          </div>}
          <button type="button" className="cenit-button cenit-button--icon cenit-button--quiet" aria-label="Cerrar ficha" autoFocus onClick={close}><XIcon size={20} aria-hidden="true" /></button>
        </div>
        <div key={contentKey} className={loading ? 'purchase-sheet__placeholder' : transition}>
          <div className="purchase-sheet__identity" hidden={query.isError}>
            <div>
              {record && <p className="purchase-sheet__label">{recordLabels.provider}</p>}
              <h2 id="purchase-sheet-title" className={!record ? 'purchase-sr-only' : undefined} ref={heading} tabIndex={-1}>{record ? record.record.provider ?? 'Proveedor sin dato' : 'Ficha de compra'}</h2>
              {record ? <p className="purchase-sheet__rut">{record.record.rut ? `RUT ${formatRut(record.record.rut)}` : 'RUT sin dato'}</p>
                : loading && <div className="purchase-sheet__identity-placeholder"><Skeleton width="5rem" /><Skeleton width="16rem" height="23px" /><Skeleton width="8rem" /></div>}
            </div>
            {record ? <div className="purchase-sheet__amount" data-long={record.record.totalAmount.length > 16 || undefined}><p className="purchase-sheet__label">{recordLabels.totalAmount}</p><strong>{amountLabel(record.record.totalAmount)}</strong></div>
              : loading && <Skeleton width="9rem" height="32px" />}
          </div>
          {record && <div className="purchase-sheet__payment">
            <span className={`purchase-pill purchase-pill--${paid ? 'paid' : 'pending'}`}>{paid ? <><CheckIcon size={14} weight="bold" aria-hidden="true" />Pagado</> : <><span className="purchase-pill__dot" aria-hidden="true" />{record.record.paymentSituation === 'PENDIENTE' ? 'Pendiente de pago' : unpaidLabel(record.record.paymentSituation)}</>}</span>
            {record.source !== 'contract_example' && <button type="button" className={`cenit-button${paid ? '' : ' cenit-button--primary'}`} aria-disabled={paymentPending} aria-busy={paymentPending}
              onClick={() => { if (!paymentPending) payment.mutate({ id: record.id, version: record.version, paymentSituation: record.record.paymentSituation, requestNumber: record.record.requestNumber }); }}>
              {paymentPending ? 'Guardando…' : paid ? 'Volver a pendiente' : <><CheckIcon size={16} weight="bold" aria-hidden="true" />Marcar como pagado</>}</button>}
          </div>}
          {loading && <div className="purchase-sheet__payment"><Skeleton width="8rem" height="28px" /><Skeleton width="11rem" height="40px" /></div>}
        </div>
      </header>

      <div key={contentKey} aria-busy={loading} className={`purchase-sheet__body${transition ? ` ${transition}` : ''}`}>
        {query.isError ? <PurchaseReadError error={query.error} returnTo={returnTo} onRetry={() => { void query.refetch(); }} /> : !record ? <div className="purchase-sheet__loading purchase-sheet__placeholder">
          <div className="purchase-sheet__card"><Skeleton width="5rem" /><Skeleton width="85%" /><Skeleton width="55%" /></div>
          <div className="purchase-sheet__card"><Skeleton width="9rem" /><Skeleton width="75%" height="22px" /><Skeleton width="60%" /></div>
        </div> : <>
          <SheetsSyncStatus purchaseId={record.id} />
          <section className="purchase-sheet__card"><p className="purchase-sheet__label">{recordLabels.description}</p><p className="purchase-sheet__description">{record.record.description}</p></section>
          <section className="purchase-sheet__card" aria-labelledby="purchase-sheet-account">
            <div className="purchase-sheet__card-heading"><h3 id="purchase-sheet-account">Cuenta de cargo</h3>
              {chargeAccount(record) && <span>{chargeAccount(record)}</span>}</div>
            <dl className="purchase-sheet__codes">
              {fact(recordLabels.unitCode!, record.record.unitCode, name('units', record.record.unitCode))}
              {fact(recordLabels.projectCode!, record.record.projectCode, name('projects', record.record.projectCode))}
              {fact(recordLabels.accountingCode!, record.record.accountingCode, name('accounts', record.record.accountingCode))}
            </dl>
          </section>
          <div className="purchase-sheet__pair">
            <section className="purchase-sheet__card" aria-labelledby="purchase-sheet-document"><h3 id="purchase-sheet-document">Documento</h3>
              <dl className="purchase-sheet__facts">{fact(recordLabels.documentType!, record.record.documentType)}{fact(recordLabels.bi!, record.record.bi)}{fact(recordLabels.document!, record.record.document)}</dl></section>
            <section className="purchase-sheet__card" aria-labelledby="purchase-sheet-tracking"><h3 id="purchase-sheet-tracking">Seguimiento</h3>
              <dl className="purchase-sheet__facts">{fact(recordLabels.area!, record.record.area)}{fact(recordLabels.item!, record.record.item)}{fact(recordLabels.paymentSituation!, record.record.paymentSituation)}</dl></section>
          </div>
          <div className="purchase-sheet__folds">
            <details>
              <summary><CaretRightIcon className="purchase-chevron" size={14} aria-hidden="true" />Datos de Oracle<span>Fecha de envío, ID, Desde, A, anexos{record.lines.length ? ` y ${record.lines.length} ${record.lines.length === 1 ? 'línea' : 'líneas'}` : ''}</span></summary>
              <dl className="purchase-sheet__facts purchase-sheet__facts--wide">
                {(Object.keys(record.oracle) as (keyof PurchaseRecord['oracle'])[]).map(key => <div key={key}><dt>{oracleLabels[key]}</dt>
                  <dd className={record.oracle[key] === null ? 'purchase-sheet__empty' : undefined}>{record.oracle[key] === null ? 'Sin dato' : key === 'sentDate' ? dateLabel(record.oracle[key]!) : key === 'taxAmount' ? amountLabel(record.oracle[key]) : record.oracle[key]}</dd></div>)}
              </dl>
              {record.lines.length > 0 && <div className="purchase-oracle__lines" role="region" aria-label="Líneas de la solicitud en Oracle" tabIndex={0}><table>
                <thead><tr><th scope="col">#</th>{(['description', 'provider', 'chargeAccount', 'amount'] as const).map(key => <th key={key} scope="col">{lineFieldLabels[key]}</th>)}</tr></thead>
                <tbody>{record.lines.map((line, position) => <tr key={position}><td>{position + 1}</td><td>{line.description ?? '—'}</td><td>{line.provider ?? '—'}</td><td>{line.chargeAccount ?? '—'}</td><td className="purchase-money">{amountLabel(line.amount)}</td></tr>)}</tbody>
              </table></div>}
            </details>
            <details>
              <summary><CaretRightIcon className="purchase-chevron" size={14} aria-hidden="true" />Registro en Cenit<span>{source(record)} · {displayDateTime(record.createdAt)}</span></summary>
              <dl className="purchase-sheet__facts purchase-sheet__facts--wide">
                <div><dt>Registrada por</dt><dd>{record.createdBy.name}<small>{displayDateTime(record.createdAt)}</small></dd></div>
                <div><dt>Procedencia</dt><dd>{source(record)}</dd></div>
                <div><dt>ID Cenit</dt><dd>{record.id}</dd></div>
                {record.capture && <div><dt>Referencia de captura</dt><dd>{record.capture.extractionId}<small>{record.capture.processorVersion} · {displayDateTime(record.capture.processedAt)}</small></dd></div>}
              </dl>
            </details>
          </div>
        </>}
      </div>

      {!query.isError && <footer className="purchase-sheet__footer">
        {record ? <>
          <DeleteRecord id={record.id} version={record.version} requestNumber={record.record.requestNumber} fallbackFocus={heading} onDeleted={() => onClose(true)}
            summary={<><div><dt>Proveedor</dt><dd>{record.record.provider ?? 'Sin dato'}</dd></div><div><dt>Monto</dt><dd>{amountLabel(record.record.totalAmount)}</dd></div></>} />
          {record.source === 'contract_example' ? <span className="purchase-origin-badge">Ejemplo de demostración</span>
            : <Link className="cenit-button" to={`/administracion/compras/${record.id}/editar`} state={{ purchasesReturnTo: returnTo }}><PencilSimpleIcon size={16} aria-hidden="true" />Editar</Link>}
        </> : <>
          <Skeleton className="purchase-sheet__placeholder" width="40px" height="40px" />
          <Skeleton className="purchase-sheet__placeholder" width="6rem" height="40px" />
        </>}
      </footer>}
    </div>
  </dialog>;
}
