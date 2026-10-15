import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { validateReviewDraft, type ExtractionResponse, type ExtractionReviewDraft, type ExtractionCandidate, type ContractProblem } from '@cenit/contracts/purchases';
import { CandidateField } from './CandidateField.js';
import { purchaseLabels, amountLabel, purchaseProblemLabel } from '../model/fields.js';

const primary = new Set(['requestNumber', 'sentDate', 'totalAmount', 'description']);
export function PurchaseReviewEditor({ original, draft, onChange, onContinue, onReset }: {
  original: ExtractionResponse; draft: ExtractionReviewDraft; onChange: (draft: ExtractionReviewDraft) => void;
  onContinue: (draft: ExtractionReviewDraft) => void; onReset?: () => void;
}) {
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
  function edit(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, lineIndex = 0) {
    onChange(group === 'lines' ? { ...draft, lines: draft.lines.map((line, i) => i === lineIndex ? { ...line, [key]: value } : line) } : { ...draft, [group]: { ...draft[group], [key]: value } });
    setProblems([]); setChecked(false);
  }
  function fields(group: 'header' | 'administrative' | 'lines', candidates: Record<string, ExtractionCandidate>, values: Record<string, string | null>, lineIndex = 0) {
    return <div className="purchase-review__grid">{Object.entries(candidates).map(([key, candidate]) => {
      const path = group === 'lines' ? `/lines/${lineIndex}/${key}` : `/${group}/${key}`;
      return <CandidateField key={key} id={`review-${group}-${lineIndex}-${key}`} label={purchaseLabels[key] ?? key} candidate={candidate} value={values[key] ?? null} long={key === 'description'} issue={original.data.issues.find(issue => issue.path === path)?.message} error={problems.find(problem => problem.path === path)?.message} onChange={value => edit(group, key, value, lineIndex)} />;
    })}</div>;
  }
  return <>
      {original.data.issues.length > 0 && <details className="purchase-review__issues"><summary><WarningCircleIcon size={16} aria-hidden="true" /><span>{original.data.issues.length} {original.data.issues.length === 1 ? 'dato por revisar' : 'datos por revisar'}</span><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /></summary><ul>{original.data.issues.map((issue, i) => <li key={i}><strong>{purchaseProblemLabel(issue.path)}</strong>: {issue.message}</li>)}</ul></details>}
      <form ref={form} noValidate onSubmit={event => { event.preventDefault(); setProblems(validateReviewDraft(draft)); setChecked(true); }}>
        <fieldset className="purchase-review__primary"><legend>Datos principales</legend>{fields('header', Object.fromEntries(Array.from(primary, key => [key, original.data.header[key as keyof typeof original.data.header]])), draft.header)}</fieldset>
        <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Datos complementarios</span></summary><div className="purchase-item__body">{fields('header', Object.fromEntries(Object.entries(original.data.header).filter(([key]) => !primary.has(key))), draft.header)}</div></details>
        <div className="purchase-list-heading"><h2>Ítems de la solicitud</h2><span className="purchase-count">{original.data.lines.length}</span></div>
        {original.data.lines.length === 0 && <p className="purchase-form-note">No se han recuperado ítems.</p>}
        {original.data.lines.map((line, i) => <details className="purchase-item" key={`${original.data.extractionId}-${i}`} aria-label={`Ítem de la solicitud ${i + 1}`}><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span className="purchase-item__number">Ítem {i + 1}</span><span className="purchase-item__description">{draft.lines[i]?.description || 'Sin descripción'}</span><span className="purchase-item__provider">{draft.lines[i]?.provider || 'Sin proveedor'}</span><span className="purchase-item__amount">{amountLabel(draft.lines[i]?.amount ?? null)}</span></summary><div className="purchase-item__body">{fields('lines', line, draft.lines[i]!, i)}</div></details>)}
        <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Seguimiento administrativo</span></summary><div className="purchase-item__body">{fields('administrative', original.data.administrative, draft.administrative)}</div></details>
        <div className="purchase-review__actions"><button className="purchase-save" type="button" onClick={() => {
          const errors = validateReviewDraft(draft); setProblems(errors); setChecked(true);
          if (!errors.length) onContinue(draft);
        }}>Continuar al formulario<ArrowRightIcon size={15} aria-hidden="true" /></button><button type="submit">Comprobar datos</button>{onReset && <button type="button" onClick={() => { setProblems([]); setChecked(false); onReset(); }}>Restablecer ejemplo</button>}</div>
        {checked && (problems.length ? <div className="purchase-error-summary" role="alert"><p>Revisa los campos indicados.</p><ul>{problems.map((problem, i) => <li key={i}><strong>{purchaseProblemLabel(problem.path)}</strong>: {problem.message}</li>)}</ul></div> : <p role="status">Formatos correctos. Puedes continuar y completar los campos obligatorios.</p>)}
      </form>
  </>;
}
