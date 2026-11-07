import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import type { ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { emptyDraft, purchaseExampleLabel } from '../model/fields.js';
import { usePurchaseTransfer } from '../model/transfer.js';
import { useAuth } from '../../auth/model/session.js';
import { usePurchaseDraft } from '../model/drafts.js';
import { usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { PurchaseForm } from '../components/PurchaseForm.js';
import { PurchaseFormSummary } from '../components/PurchaseFormSummary.js';
import '../records.css';
import '../review.css';

export function PurchaseCreate() {
  const transfer = usePurchaseTransfer(), snapshot = usePurchaseDraft(), guard = usePurchaseGuard();
  const returnTo = usePurchaseReturnTo(), navigate = useNavigate(), accountId = useAuth().session!.account.id;
  const [restored] = useState(() => snapshot.current?.accountId === accountId && snapshot.current.kind === 'create' ? snapshot.current : null);
  const [incoming] = useState(() => transfer.peek());
  const origin = restored?.origin ?? incoming?.origin ?? null;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => restored?.draft ?? incoming?.draft ?? emptyDraft());
  const [lineKeys, setLineKeys] = useState(() => restored?.lineKeys ?? draft.lines.map(() => crypto.randomUUID()));
  const [operationId] = useState(() => restored?.operationId ?? incoming?.operationId ?? crypto.randomUUID());
  const saved = useRef(false);
  useEffect(() => { if (incoming) transfer.consume(incoming.operationId); }, [incoming, transfer]);
  useEffect(() => { if (!saved.current) snapshot.current = { kind: 'create', accountId, draft, lineKeys, origin, operationId }; }, [accountId, draft, lineKeys, origin, operationId, snapshot]);
  return <section className="purchase-records">
    <Link className="purchase-back-link" to={returnTo} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); guard.request(() => navigate(returnTo), event.currentTarget); }}><ArrowLeftIcon size={16} aria-hidden="true" />Volver al registro</Link>
    <div className="purchase-page-heading"><div><h1>Registrar compra</h1><p>Completa los cuatro campos principales. Los demás son opcionales.</p></div>{origin?.type === 'contract_example' && <span className="purchase-origin-badge">Ejemplo de demostración · {purchaseExampleLabel(origin.exampleId)}</span>}</div>
    <div className="purchase-form-layout"><PurchaseForm draft={draft} onChange={setDraft} lineKeys={lineKeys} onLineKeysChange={setLineKeys} origin={origin} operationId={operationId} returnTo={returnTo} onSaved={() => { saved.current = true; }} /><PurchaseFormSummary draft={draft} /></div>
  </section>;
}
