import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { useQuery } from '@tanstack/react-query';
import type { ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { getPurchase } from '../api/purchases.js';
import { PurchaseForm } from '../components/PurchaseForm.js';
import { PurchaseFormSummary } from '../components/PurchaseFormSummary.js';
import { PurchaseReadError } from '../components/PurchaseReadError.js';
import { emptyDraft } from '../model/fields.js';
import { usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import '../records.css';
import '../review.css';

export function PurchaseEdit() {
  const { id = '' } = useParams();
  const detailPath = `/administracion/compras/${id}`;
  const returnToList = usePurchaseReturnTo(), navigate = useNavigate(), guard = usePurchaseGuard();
  const query = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: ({ signal }) => getPurchase(id, signal) });
  const record = query.isError ? undefined : query.data?.data;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(emptyDraft());
  const [lineKeys, setLineKeys] = useState<string[]>([]);
  const initialDraft = useRef<ExtractionReviewDraft | null>(null);
  const initialVersion = useRef<number | null>(null);

  useEffect(() => {
    if (!record || initialDraft.current) return;
    const initial = { header: { ...record.header }, administrative: { ...record.administrative }, lines: record.lines.map(line => ({ ...line })) };
    initialDraft.current = initial;
    initialVersion.current = record.version;
    setDraft(initial);
    setLineKeys(initial.lines.map(() => crypto.randomUUID()));
  }, [record]);
  const editDraft = initialDraft.current, editVersion = initialVersion.current;

  function backToDetail(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    guard.request(() => navigate(detailPath, { state: { purchasesReturnTo: returnToList } }), event.currentTarget);
  }

  return <section className="purchase-records">
    <Link className="purchase-back-link" to={detailPath} state={{ purchasesReturnTo: returnToList }} onClick={backToDetail}><ArrowLeftIcon size={16} aria-hidden="true" />Volver al detalle</Link>
    {query.isPending ? <p className="purchase-state" role="status">Cargando detalle…</p> : query.isError ? <PurchaseReadError error={query.error} returnTo={returnToList} onRetry={() => { void query.refetch(); }} /> : record?.source === 'contract_example' ? <div className="purchase-state"><p>Los ejemplos de demostración no se pueden editar.</p><Link className="cenit-button" to={detailPath} state={{ purchasesReturnTo: returnToList }}>Volver al detalle</Link></div> : record && editDraft && editVersion !== null && <>
      <div className="purchase-page-heading"><div><h1>Editar compra</h1><p>Corrige los datos de la copia guardada en Cenit.</p></div></div>
      <div className="purchase-form-layout"><PurchaseForm draft={draft} onChange={setDraft} lineKeys={lineKeys} onLineKeysChange={setLineKeys} origin={null} returnTo={detailPath} edit={{ id: record.id, expectedVersion: editVersion, initialDraft: editDraft, returnToList }} /><PurchaseFormSummary draft={draft} /></div>
    </>}
  </section>;
}
