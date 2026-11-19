import { useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { useQuery } from '@tanstack/react-query';
import { getPurchase } from '../api/purchases.js';
import { PurchaseCapabilitiesProvider } from '../model/capabilities.js';
import { SheetsSyncStatus } from '../components/SheetsSyncStatus.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { DeleteRecord } from '../components/DeleteRecord.js';
import { PurchaseReadError } from '../components/PurchaseReadError.js';
import { PurchaseDetailSkeleton } from '../components/PurchaseSkeletons.js';
import { Skeleton } from '../../../shared/components/Skeleton.js';
import { purchaseLabels, amountLabel, dateLabel, purchaseExampleLabel, sentenceCase } from '../model/fields.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { displayDateTime } from '../../../shared/lib/dates.js';
import '../records.css';

type Values = Record<string, string | null>;
const display = (key: string, value: string | null) => ['totalAmount', 'taxAmount', 'price', 'amount'].includes(key) ? amountLabel(value) : key === 'sentDate' && value ? dateLabel(value) : value ?? 'Sin dato';
const accountKeys = ['universityCode', 'campusCode', 'unitCode', 'projectCode', 'accountingCode'];
// La cuenta completa ya contiene los cinco códigos: se muestran aparte sólo si difieren de ella.
function withoutRedundantCodes(line: Values): Values {
  const parts = line.chargeAccount?.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1);
  if (!parts || !accountKeys.every((key, i) => line[key] === null || line[key] === parts[i])) return line;
  return Object.fromEntries(Object.entries(line).filter(([key]) => !accountKeys.includes(key)));
}
function Fields({ values, className = 'purchase-detail-fields' }: { values: Values; className?: string }) {
  return <dl className={className}>{Object.entries(values).map(([key, value]) => <div className={key === 'description' ? 'purchase-input--wide' : undefined} key={key}><dt>{purchaseLabels[key]}</dt><dd className={value === null ? 'purchase-detail-empty' : undefined}>{display(key, value)}</dd></div>)}</dl>;
}
// Read-only view: filled values first; empty ones stay one click away instead of filling the screen with «Sin dato».
function KnownFields({ values }: { values: Values }) {
  const entries = Object.entries(values), empty = entries.filter(([, value]) => value === null);
  const known = Object.fromEntries(entries.filter(([, value]) => value !== null));
  return <>{Object.keys(known).length > 0 && <Fields values={known} className="purchase-detail-list" />}
    {empty.length > 0 && <details className="purchase-detail-empties"><summary><CaretRightIcon className="purchase-chevron" size={13} aria-hidden="true" />{Object.keys(known).length ? `Mostrar ${empty.length} ${empty.length === 1 ? 'campo' : 'campos'} sin dato` : `Los ${empty.length} campos están sin dato`}</summary><Fields values={Object.fromEntries(empty)} className="purchase-detail-list" /></details>}</>;
}
export function PurchaseDetail() {
  const { id = '' } = useParams();
  const returnTo = usePurchaseReturnTo();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: ({ signal }) => getPurchase(id, signal) });
  const record = query.isError ? undefined : query.data?.data;
  const primary = new Set(['requestNumber', 'sentDate', 'description', 'totalAmount']);
  const source = record && (record.source === 'image_capture' ? 'Captura procesada y revisada' : record.source === 'manual' ? 'Ingreso manual' : `Ejemplo de demostración · ${purchaseExampleLabel(record.exampleId)}`);
  return <section className="purchase-records purchase-detail"><Link className="purchase-back-link" to={returnTo}><ArrowLeftIcon size={15} aria-hidden="true" />Volver al registro</Link>
    <PurchaseCapabilitiesProvider fallback={<>
      <div className="purchase-page-heading purchase-detail-heading"><div><h1>Detalle del registro</h1><Skeleton width="55%" height="22.5px" /></div></div>
      <PurchaseDetailSkeleton />
    </>}>
    {({ secondReviewEnabled }) => <>
    <div className="purchase-page-heading purchase-detail-heading"><div><h1 ref={heading} tabIndex={-1}>{record ? `Solicitud ${record.header.requestNumber}` : 'Detalle del registro'}</h1>{query.isPending && <><Skeleton width="55%" height="22.5px" />{secondReviewEnabled && <Skeleton className="purchase-status" width="9rem" height="24px" />}</>}{record && <p className="purchase-detail-description">{record.header.description}</p>}{record && secondReviewEnabled && <span className={`purchase-status${record.reviewStatus === 'reviewed' ? ' purchase-status--reviewed' : ''}`}>{record.reviewStatus === 'pending' ? <ClockIcon size={14} aria-hidden="true" /> : <CheckCircleIcon size={14} aria-hidden="true" />}{record.reviewStatus === 'pending' ? 'Por revisar en Cenit' : 'Revisado en Cenit'}</span>}</div>
      {record && <div className="purchase-detail-actions">{record.source === 'contract_example' ? <span className="purchase-origin-badge">Ejemplo de demostración · {purchaseExampleLabel(record.exampleId)}</span> : <Link className="cenit-button" to={`/administracion/compras/${record.id}/editar`} state={{ purchasesReturnTo: returnTo }}>Editar</Link>}{secondReviewEnabled && record.reviewStatus === 'pending' && <ValidateRecord id={record.id} version={record.version} requestNumber={record.header.requestNumber!} fallbackFocus={heading} />}<DeleteRecord id={record.id} version={record.version} requestNumber={record.header.requestNumber} fallbackFocus={heading} onDeleted={() => navigate(returnTo, { replace: true })} summary={<><div><dt>Monto total</dt><dd>{amountLabel(record.header.totalAmount)}</dd></div><div><dt>Ítems</dt><dd>{record.lines.length}</dd></div></>} /></div>}</div>
    {query.isPending ? <PurchaseDetailSkeleton /> : query.isError ? <PurchaseReadError error={query.error} returnTo={returnTo} onRetry={() => { void query.refetch(); }} /> : record && <>
      <SheetsSyncStatus purchaseId={record.id} />
      <section className="purchase-detail-section purchase-detail-summary" aria-labelledby="purchase-main-title"><h2 id="purchase-main-title" className="purchase-sr-only">Datos principales</h2>
        <div className="purchase-detail-heading__amount"><span>Monto total · CLP</span><strong>{amountLabel(record.header.totalAmount)}</strong></div>
        <Fields values={Object.fromEntries(Object.entries(record.header).filter(([key]) => primary.has(key) && key !== 'totalAmount' && key !== 'description'))} className="purchase-detail-facts" />
        <dl className="purchase-detail-facts"><div><dt>{purchaseLabels.documentType}</dt><dd className={record.administrative.documentType === null ? 'purchase-detail-empty' : undefined}>{record.administrative.documentType ? sentenceCase(record.administrative.documentType) : 'Sin dato'}</dd></div><div><dt>Procedencia</dt><dd>{source}</dd></div></dl>
      </section>
      <section className="purchase-detail-section"><div className="purchase-list-heading"><h2>Ítems de la solicitud</h2><span className="purchase-count">{record.lines.length}</span></div>{!record.lines.length ? <p className="purchase-form-note">No hay ítems registrados.</p> : <div className="purchase-detail-items">{record.lines.map((line, index) => <details className="purchase-item" key={index}><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span className="purchase-item__number">Ítem {index + 1}</span><span className="purchase-item__description">{line.description || 'Sin descripción'}</span><span className="purchase-item__provider">{line.provider || 'Sin proveedor'}</span><span className="purchase-item__amount">{amountLabel(line.amount)}</span></summary><Fields values={withoutRedundantCodes(line)} /></details>)}</div>}</section>
      <div className="purchase-detail-columns">
        <section className="purchase-detail-box" aria-labelledby="purchase-request-title"><h2 id="purchase-request-title">Datos de la solicitud</h2><KnownFields values={Object.fromEntries(Object.entries(record.header).filter(([key]) => !primary.has(key)))} /></section>
          <section className="purchase-detail-box" aria-labelledby="purchase-admin-title"><h2 id="purchase-admin-title">Seguimiento administrativo</h2><KnownFields values={Object.fromEntries(Object.entries(record.administrative).filter(([key]) => key !== 'documentType'))} /></section>
      </div>
      <section className="purchase-detail-box purchase-detail-box--muted" aria-labelledby="purchase-provenance-title"><h2 id="purchase-provenance-title">Registro en Cenit</h2><dl className="purchase-detail-list"><div><dt>Registrado por</dt><dd>{record.createdBy.name}<br />{displayDateTime(record.createdAt)}</dd></div>{secondReviewEnabled && record.reviewedBy && <div><dt>Revisado en Cenit por</dt><dd>{record.reviewedBy.name}<br />{displayDateTime(record.reviewedAt!)}</dd></div>}</dl>
            <details className="purchase-technical"><summary><CaretRightIcon className="purchase-chevron" size={13} aria-hidden="true" />Información técnica</summary><dl className="purchase-detail-list"><div><dt>ID Cenit</dt><dd>{record.id}</dd></div>{record.capture && <div><dt>Referencia de captura</dt><dd>{record.capture.extractionId}<br />{record.capture.processorVersion}<br />{displayDateTime(record.capture.processedAt)}</dd></div>}</dl></details></section>
    </>}
    </>}
    </PurchaseCapabilitiesProvider>
  </section>;
}
