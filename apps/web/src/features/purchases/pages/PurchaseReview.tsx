import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { usePurchaseTransfer } from '../model/transfer.js';
import { createReviewDraft, validateReviewDraft, validateExtractionResponse, type ExtractionReviewDraft, type ExtractionCandidate, type ContractProblem } from '@cenit/contracts/purchases';
import { extractionExamples, extractionErrorExamples } from '@cenit/contracts/purchases/examples';
import { CandidateField } from '../components/CandidateField.js';
import { purchaseLabels, amountLabel, emptyDraft, purchaseProblemLabel, purchaseExampleLabel } from '../model/fields.js';
import '../records.css';
import '../review.css';

const primary = new Set(['requestNumber', 'sentDate', 'totalAmount', 'description']);
const first = extractionExamples[0];
export function PurchaseReview() {
  const transfer = usePurchaseTransfer(), navigate = useNavigate();
  const [exampleId, setExampleId] = useState<string>(first.id);
  const example = extractionExamples.find(entry => entry.id === exampleId);
  const original = example?.response;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => createReviewDraft(first.response));
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const [checked, setChecked] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!problems.length) return;
    const invalid = form.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[aria-invalid="true"]');
    invalid?.forEach(field => {
      let item = field.closest('details');
      while (item) { item.open = true; item = item.parentElement?.closest('details') ?? null; }
    });
    invalid?.[0]?.focus();
  }, [problems]);
  const invalidFixture = original ? validateExtractionResponse(original).length > 0 : false;
  function select(id: string) {
    const next = extractionExamples.find(entry => entry.id === id);
    setExampleId(id); setProblems([]); setChecked(false);
    if (next) setDraft(createReviewDraft(next.response));
    else setDraft(emptyDraft());
  }
  function edit(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, lineIndex = 0) {
    setDraft(previous => group === 'lines' ? { ...previous, lines: previous.lines.map((line, i) => i === lineIndex ? { ...line, [key]: value } : line) } : { ...previous, [group]: { ...previous[group], [key]: value } });
    setProblems([]); setChecked(false);
  }
  function fields(group: 'header' | 'administrative' | 'lines', candidates: Record<string, ExtractionCandidate>, values: Record<string, string | null>, lineIndex = 0) {
    return <div className="purchase-review__grid">{Object.entries(candidates).map(([key, candidate]) => {
      const path = group === 'lines' ? `/lines/${lineIndex}/${key}` : `/${group}/${key}`;
      return <CandidateField key={key} id={`review-${group}-${lineIndex}-${key}`} label={purchaseLabels[key] ?? key} candidate={candidate} value={values[key] ?? null} long={key === 'description'} issue={original?.data.issues.find(issue => issue.path === path)?.message} error={problems.find(problem => problem.path === path)?.message} onChange={value => edit(group, key, value, lineIndex)} />;
    })}</div>;
  }
  return <section className="purchase-records purchase-review">
    <Link className="purchase-back-link" to="/administracion/compras"><ArrowLeftIcon size={13} aria-hidden="true" />Volver a solicitudes</Link>
    <div className="purchase-page-heading"><div><h1>Revisar datos</h1><p>Revisa y completa la información antes de continuar.</p></div><span className="purchase-origin-badge">Ejemplo de demostración</span></div>
    <div className="purchase-review__toolbar"><div><label htmlFor="review-example">Datos de ejemplo</label><select id="review-example" value={exampleId} onChange={event => select(event.target.value)}>
      {extractionExamples.map(entry => <option key={entry.id} value={entry.id}>{purchaseExampleLabel(entry.id)}</option>)}
      <option value="failure">Fallo de procesamiento</option>
    </select></div>{original && <span className="purchase-review__metadata">Fuente: {original.data.input.name}</span>}</div>
    {!original ? <div className="purchase-state" role="alert"><p>{extractionErrorExamples.find(entry => entry.body.error.code === 'EXTRACTION_NO_DATA')!.body.error.message}</p><p>Selecciona otro ejemplo para continuar.</p></div> : invalidFixture ? <p role="alert">No se pueden revisar estos datos. Selecciona otro ejemplo.</p> : <>
      {original.data.issues.length > 0 && <details className="purchase-review__issues"><summary><WarningCircleIcon size={16} aria-hidden="true" /><span>{original.data.issues.length} {original.data.issues.length === 1 ? 'dato por revisar' : 'datos por revisar'}</span><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /></summary><ul>{original.data.issues.map((issue, i) => <li key={i}><strong>{purchaseProblemLabel(issue.path)}</strong>: {issue.message}</li>)}</ul></details>}
      <form ref={form} noValidate onSubmit={event => { event.preventDefault(); setProblems(validateReviewDraft(draft)); setChecked(true); }}>
        <fieldset className="purchase-review__primary"><legend>Datos principales</legend>{fields('header', Object.fromEntries(Array.from(primary, key => [key, original.data.header[key as keyof typeof original.data.header]])), draft.header)}</fieldset>
        <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Datos complementarios</span></summary><div className="purchase-item__body">{fields('header', Object.fromEntries(Object.entries(original.data.header).filter(([key]) => !primary.has(key))), draft.header)}</div></details>
        <div className="purchase-list-heading"><h2>Ítems de la solicitud</h2><span className="purchase-count">{original.data.lines.length}</span></div>
        {original.data.lines.length === 0 && <p className="purchase-form-note">No hay ítems en este ejemplo.</p>}
        {original.data.lines.map((line, i) => <details className="purchase-item" key={`${exampleId}-${i}`} aria-label={`Ítem de la solicitud ${i + 1}`}><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span className="purchase-item__number">Ítem {i + 1}</span><span className="purchase-item__description">{draft.lines[i]?.description || 'Sin descripción'}</span><span className="purchase-item__provider">{draft.lines[i]?.provider || 'Sin proveedor'}</span><span className="purchase-item__amount">{amountLabel(draft.lines[i]?.amount ?? null)}</span></summary><div className="purchase-item__body">{fields('lines', line, draft.lines[i]!, i)}</div></details>)}
        <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Seguimiento administrativo</span></summary><div className="purchase-item__body">{fields('administrative', original.data.administrative, draft.administrative)}</div></details>
        <div className="purchase-review__actions"><button className="purchase-save" type="button" onClick={() => {
          const errors = validateReviewDraft(draft); setProblems(errors); setChecked(true);
          if (!errors.length && example && !invalidFixture) {
            transfer.put(draft, { type: 'contract_example', exampleId: example.id });
            navigate('/administracion/compras/nueva');
          }
        }}>Continuar al formulario<ArrowRightIcon size={15} aria-hidden="true" /></button><button type="submit">Comprobar datos</button><button type="button" onClick={() => select(exampleId)}>Restablecer ejemplo</button></div>
        {checked && (problems.length ? <div className="purchase-error-summary" role="alert"><p>Revisa los campos indicados.</p><ul>{problems.map((problem, i) => <li key={i}><strong>{purchaseProblemLabel(problem.path)}</strong>: {problem.message}</li>)}</ul></div> : <p role="status">Formatos correctos. Puedes continuar y completar los campos obligatorios.</p>)}
      </form>
    </>}
  </section>;
}
