import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { usePurchaseTransfer } from '../model/transfer.js';
import { createReviewDraft, validateExtractionResponse, type ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { extractionExamples, extractionErrorExamples } from '@cenit/contracts/purchases/examples';
import { emptyDraft, purchaseExampleLabel } from '../model/fields.js';
import '../records.css';
import '../review.css';

import { PurchaseReviewEditor } from '../components/PurchaseReviewEditor.js';
const first = extractionExamples[0];
export function PurchaseReview() {
  const transfer = usePurchaseTransfer(), navigate = useNavigate();
  const [exampleId, setExampleId] = useState<string>(first.id);
  const example = extractionExamples.find(entry => entry.id === exampleId);
  const original = example?.response;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => createReviewDraft(first.response));
  const invalidFixture = original ? validateExtractionResponse(original).length > 0 : false;
  function select(id: string) {
    const next = extractionExamples.find(entry => entry.id === id);
    setExampleId(id);
    if (next) setDraft(createReviewDraft(next.response));
    else setDraft(emptyDraft());
  }
  return <section className="purchase-records purchase-review">
    <Link className="purchase-back-link" to="/administracion/compras"><ArrowLeftIcon size={13} aria-hidden="true" />Volver a solicitudes</Link>
    <div className="purchase-page-heading"><div><h1>Revisar datos</h1><p>Revisa y completa la información antes de continuar.</p></div><span className="purchase-origin-badge">Ejemplo de demostración</span></div>
    <div className="purchase-review__toolbar"><div><label htmlFor="review-example">Datos de ejemplo</label><select id="review-example" value={exampleId} onChange={event => select(event.target.value)}>
      {extractionExamples.map(entry => <option key={entry.id} value={entry.id}>{purchaseExampleLabel(entry.id)}</option>)}
      <option value="failure">Fallo de procesamiento</option>
    </select></div>{original && <span className="purchase-review__metadata">Fuente: {original.data.input.name}</span>}</div>
    {!original ? <div className="purchase-state" role="alert"><p>{extractionErrorExamples.find(entry => entry.body.error.code === 'EXTRACTION_NO_DATA')!.body.error.message}</p><p>Selecciona otro ejemplo para continuar.</p></div> : invalidFixture ? <p role="alert">No se pueden revisar estos datos. Selecciona otro ejemplo.</p> : <>
      <PurchaseReviewEditor key={exampleId} original={original} draft={draft} onChange={setDraft} onReset={() => select(exampleId)} onContinue={values => {
        if (example && !invalidFixture) { transfer.put(values, { type: 'contract_example', exampleId: example.id }); navigate('/administracion/compras/nueva'); }
      }} />
    </>}
  </section>;
}
