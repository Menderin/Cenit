import { Link, useParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { useQuery } from '@tanstack/react-query';
import { getPurchase } from '../api/purchases.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { purchaseLabels, amountLabel, dateLabel, purchaseExampleLabel } from '../model/fields.js';
import { usePurchaseReturnTo } from '../model/location.js';
import '../records.css';

function Fields({ values }: { values: Record<string, string | null> }) {
  return <dl className="purchase-detail-fields">{Object.entries(values).map(([key, value]) => <div className={key === 'description' ? 'purchase-input--wide' : undefined} key={key}><dt>{purchaseLabels[key]}</dt><dd>{['totalAmount', 'taxAmount', 'price', 'amount'].includes(key) ? amountLabel(value) : key === 'sentDate' && value ? dateLabel(value) : value ?? 'Sin dato'}</dd></div>)}</dl>;
}
export function PurchaseDetail() {
  const { id = '' } = useParams();
  const returnTo = usePurchaseReturnTo();
  const query = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: ({ signal }) => getPurchase(id, signal) });
  const record = query.isError ? undefined : query.data?.data;
  const primary = new Set(['requestNumber', 'sentDate', 'description', 'totalAmount']);
  return <section className="purchase-records"><Link className="purchase-back-link" to={returnTo}><ArrowLeftIcon size={15} aria-hidden="true" />Volver a solicitudes</Link><div className="purchase-page-heading purchase-detail-heading"><div><p className="admin-section-label">Detalle de solicitud</p><h1>{record ? `Solicitud ${record.header.requestNumber}` : 'Detalle de solicitud'}</h1>{record && <span className={`purchase-status${record.reviewStatus === 'reviewed' ? ' purchase-status--reviewed' : ''}`}>{record.reviewStatus === 'pending' ? <ClockIcon size={14} aria-hidden="true" /> : <CheckCircleIcon size={14} aria-hidden="true" />}{record.reviewStatus === 'pending' ? 'Pendiente de validación' : 'Validado'}</span>}</div>{record && <div className="purchase-detail-heading__amount"><span>Monto total · CLP</span><strong>{amountLabel(record.header.totalAmount)}</strong></div>}</div>
    {query.isPending ? <p className="purchase-state" role="status">Cargando detalle…</p> : query.isError ? <div className="purchase-state" role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Reintentar</button></div> : record && <>
      <div className="purchase-detail-actions">{record.source === 'contract_example' && <span className="purchase-origin-badge">Ejemplo de demostración · {purchaseExampleLabel(record.exampleId)}</span>}{record.reviewStatus === 'pending' && <ValidateRecord id={record.id} version={record.version} />}</div>
      <section className="purchase-detail-section"><h2>Datos principales</h2><Fields values={Object.fromEntries(Object.entries(record.header).filter(([key]) => primary.has(key) && key !== 'totalAmount'))} /></section>
      <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Datos complementarios</span></summary><Fields values={Object.fromEntries(Object.entries(record.header).filter(([key]) => !primary.has(key)))} /></details>
      <section className="purchase-detail-section"><div className="purchase-list-heading"><h2>Ítems de la solicitud</h2><span className="purchase-count">{record.lines.length}</span></div>{!record.lines.length ? <p className="purchase-form-note">No hay ítems registrados.</p> : record.lines.map((line, index) => <details className="purchase-item" key={index}><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span className="purchase-item__number">Ítem {index + 1}</span><span className="purchase-item__description">{line.description || 'Sin descripción'}</span><span className="purchase-item__provider">{line.provider || 'Sin proveedor'}</span><span className="purchase-item__amount">{amountLabel(line.amount)}</span></summary><Fields values={line} /></details>)}</section>
      <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Seguimiento administrativo</span></summary><Fields values={record.administrative} /></details>
      <section className="purchase-detail-section"><h2>Registro y procedencia</h2><div className="purchase-detail-meta"><p><strong>Procedencia</strong>{record.source === 'manual' ? 'Ingreso manual' : `Ejemplo de demostración · ${purchaseExampleLabel(record.exampleId)}`}</p><p><strong>Registrado por</strong>{record.createdBy.name}<br />{new Date(record.createdAt).toLocaleString('es-CL')}</p>{record.reviewedBy && <p><strong>Validado por</strong>{record.reviewedBy.name}<br />{new Date(record.reviewedAt!).toLocaleString('es-CL')}</p>}<p><strong>ID Cenit</strong>{record.id}</p></div></section>
    </>}
  </section>;
}
