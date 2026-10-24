import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { usePurchaseTransfer } from '../model/transfer.js';
import { useAuth } from '../../auth/model/session.js';
import { usePurchaseDraft } from '../model/drafts.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { createReviewDraft, validateExtractionResponse, type ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { extractionExamples, extractionErrorExamples } from '@cenit/contracts/purchases/examples';
import { emptyDraft, purchaseExampleLabel } from '../model/fields.js';
import { PurchaseReviewEditor } from '../components/PurchaseReviewEditor.js';
import '../records.css';
import '../review.css';

const first = extractionExamples[0];
export function PurchaseReview() {
  const transfer = usePurchaseTransfer(), navigate = useNavigate();
  const snapshot = usePurchaseDraft(), guard = usePurchaseGuard(), returnTo = usePurchaseReturnTo();
  const accountId = useAuth().session!.account.id;
  const [restored] = useState(() => snapshot.current?.accountId === accountId && snapshot.current.kind === 'review' ? snapshot.current : null);
  const [exampleId, setExampleId] = useState<string>(restored?.exampleId ?? first.id);
  const example = extractionExamples.find(entry => entry.id === exampleId);
  const original = example?.response;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => restored?.draft ?? createReviewDraft(first.response));
  const dirty = !!original && JSON.stringify(draft) !== JSON.stringify(createReviewDraft(original));
  useGuardChanges(dirty, false, () => { if (dirty) snapshot.current = null; });
  useEffect(() => { snapshot.current = { kind: 'review', accountId, exampleId, draft }; }, [accountId, exampleId, draft, snapshot]);
  const invalidFixture = original ? validateExtractionResponse(original).length > 0 : false;

  function select(id: string) {
    const next = extractionExamples.find(entry => entry.id === id);
    setExampleId(id);
    setDraft(next ? createReviewDraft(next.response) : emptyDraft());
  }

  return <section className="purchase-records purchase-review">
    <Link className="purchase-back-link" to={returnTo} onClick={event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      guard.request(() => navigate(returnTo), event.currentTarget);
    }}><ArrowLeftIcon size={13} aria-hidden="true" />Volver al registro</Link>
    <div className="purchase-page-heading"><div><h1>Revisar datos</h1><p>Revisa y completa la información antes de continuar.</p></div><span className="purchase-origin-badge">Ejemplo de demostración</span></div>
    <div className="purchase-review__toolbar"><div><label htmlFor="review-example">Datos de ejemplo</label><select id="review-example" value={exampleId} onChange={event => {
      const next = event.target.value;
      guard.request(() => select(next), event.currentTarget, { title: 'Cambiar ejemplo', description: 'Se descartarán tus correcciones y se cargarán los datos del otro ejemplo.', confirmLabel: 'Descartar y cambiar' });
    }}>
      {extractionExamples.map(entry => <option key={entry.id} value={entry.id}>{purchaseExampleLabel(entry.id)}</option>)}
      <option value="failure">Fallo de procesamiento</option>
    </select></div>{original && <span className="purchase-review__metadata">Fuente: {original.data.input.name}</span>}</div>
    {!original ? <div className="purchase-state" role="alert"><p>{extractionErrorExamples.find(entry => entry.body.error.code === 'EXTRACTION_NO_DATA')!.body.error.message}</p><p>Selecciona otro ejemplo para continuar.</p></div> : invalidFixture ? <p role="alert">No se pueden revisar estos datos. Selecciona otro ejemplo.</p> : <PurchaseReviewEditor key={exampleId} original={original} draft={draft} onChange={setDraft}
      onReset={origin => guard.request(() => select(exampleId), origin, { title: 'Restablecer ejemplo', description: 'Se descartarán tus correcciones y se recuperarán los valores originales.', confirmLabel: 'Descartar y restablecer' })}
      onContinue={values => {
        if (!example || invalidFixture) return;
        transfer.put(values, { type: 'contract_example', exampleId: example.id });
        snapshot.current = null;
        guard.leave(() => navigate('/administracion/compras/nueva', { state: { purchasesReturnTo: returnTo } }));
      }} />}
  </section>;
}
