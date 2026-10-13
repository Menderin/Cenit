import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getPurchase } from '../api/purchases.js';
import { ValidateRecord } from '../components/ValidateRecord.js';
import { purchaseLabels } from '../model/fields.js';
import '../records.css';

function Fields({ values }: { values: Record<string, string | null> }) {
  return <dl className="purchase-detail-fields">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{purchaseLabels[key]}</dt><dd>{value ?? 'Sin dato'}</dd></div>)}</dl>;
}
export function PurchaseDetail() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: ({ signal }) => getPurchase(id, signal) });
  const record = query.data?.data;
  return <section className="purchase-records"><Link to="/administracion/compras">Volver a solicitudes</Link><h1>Detalle de solicitud</h1>
    {query.isPending ? <p role="status">Cargando detalle…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Reintentar</button></div> : record && <>
      <p>Estado local: {record.reviewStatus === 'pending' ? 'Pendiente de validación' : 'Validado'}. Origen: {record.source === 'manual' ? 'ingreso manual' : `ejemplo ficticio sin extracción real (${record.exampleId})`}.</p>
      <p>ID Cenit: {record.id}</p><p>Creado por {record.createdBy.name} · {new Date(record.createdAt).toLocaleString('es-CL')}</p>
      {record.reviewedBy && <p>Validado por {record.reviewedBy.name} · {new Date(record.reviewedAt!).toLocaleString('es-CL')}</p>}
      {record.reviewStatus === 'pending' && <ValidateRecord id={record.id} version={record.version} />}
      <h2>Cabecera de la solicitud</h2><Fields values={record.header} />
      <h2>Ítems de la solicitud</h2>{!record.lines.length ? <p>No hay ítems registrados.</p> : <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label="Ítems de la solicitud"><table><thead><tr>{Object.keys(record.lines[0]!).map(key => <th scope="col" key={key}>{purchaseLabels[key]}</th>)}</tr></thead><tbody>{record.lines.map((line, index) => <tr key={index}>{Object.entries(line).map(([key, value]) => <td key={key}>{value ?? 'Sin dato'}</td>)}</tr>)}</tbody></table></div>}
      <h2>Seguimiento administrativo</h2><Fields values={record.administrative} />
    </>}
  </section>;
}
