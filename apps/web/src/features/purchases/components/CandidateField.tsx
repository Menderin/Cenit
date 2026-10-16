import type { ExtractionCandidate } from '@cenit/contracts/purchases';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
const statusLabels = { recovered: 'Disponible', missing: 'Sin dato', invalid: 'Formato inválido', ambiguous: 'Por aclarar' };
export function CandidateField({ id, label, candidate, value, onChange, error, issue, long = false }: {
  id: string; label: string; candidate: ExtractionCandidate; value: string | null;
  onChange: (value: string | null) => void; error?: string; issue?: string; long?: boolean;
}) {
  const changed = value !== candidate.value;
  const props = { id, value: value ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value === '' ? null : event.target.value),
    maxLength: long ? 1000 : 255, 'aria-invalid': !!error, 'aria-describedby': `${id}-origin${issue ? ` ${id}-issue` : ''}${error ? ` ${id}-error` : ''}` };
  return <div className={`purchase-review__field${long ? ' purchase-input--wide' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {long ? <textarea {...props} rows={3} /> : <input {...props} type="text" autoComplete="off" />}
    <div id={`${id}-origin`} className="purchase-review__origin"><div className="purchase-review__field-status"><span data-status={candidate.status}>{statusLabels[candidate.status]}</span>{changed && <span className="purchase-review__changed">Modificado</span>}</div><details className="purchase-review__original"><summary><CaretRightIcon className="purchase-chevron" size={12} aria-hidden="true" />Revisar original<span className="purchase-sr-only"> de {label}</span></summary><dl><div><dt>Valor original</dt><dd>{candidate.value ?? 'Sin dato'}</dd></div>{candidate.rawText !== null && candidate.rawText !== candidate.value && <div><dt>Texto fuente</dt><dd>{candidate.rawText}</dd></div>}</dl></details></div>
    {issue && <p id={`${id}-issue`} className="purchase-review__issue">{issue}</p>}
    {error && <p id={`${id}-error`} className="purchase-review__error">{error}</p>}
  </div>;
}
