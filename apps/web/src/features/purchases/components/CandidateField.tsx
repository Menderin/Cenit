import type { ExtractionCandidate } from '@cenit/contracts/purchases';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { useRef } from 'react';
import { DateField } from '../../../shared/components/DateField.js';
import { amountFields, normalizeAmountInput } from '../model/fields.js';
const statusLabels = { recovered: 'Recuperado', missing: 'Sin dato', invalid: 'Formato inválido', ambiguous: 'Por aclarar' };
export function CandidateField({ id, label, candidate, value, onChange, error, issue, long = false, field, required = false, disabled = false, sourcePath, active = false, onFocus, locationAvailable }: {
  id: string; label: string; candidate?: ExtractionCandidate; value: string | null;
  onChange: (value: string | null) => void; error?: string; issue?: string; long?: boolean;
  field?: string; required?: boolean; disabled?: boolean; sourcePath?: string; active?: boolean;
  onFocus?: () => void; locationAvailable?: boolean;
}) {
  const changed = !!candidate && value !== candidate.value;
  const kind = field ?? id.split('-').at(-1);
  // Only what the person typed is normalized; extracted candidates are never corrected silently.
  const edited = useRef(false), amount = amountFields.has(kind ?? '');
  const props = { id, value: value ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { edited.current = true; onChange(event.target.value === '' ? null : event.target.value); },
    required, disabled, onFocus: () => { edited.current = false; onFocus?.(); }, 'data-source-path': sourcePath,
    maxLength: long ? 1000 : 255, 'aria-invalid': !!error,
    'aria-describedby': [candidate ? `${id}-origin` : '', issue && !changed ? `${id}-issue` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined };
  return <div className={`purchase-input purchase-review__field${long ? ' purchase-input--wide' : ''}${active ? ' purchase-review__field--active' : ''}`}>
    <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
    {long ? <textarea {...props} className="cenit-input" rows={3} /> : kind === 'sentDate' ? <DateField {...props} label={label} onValueChange={next => onChange(next || null)} />
      : <input {...props} className="cenit-input" type={kind === 'sentTime' ? 'time' : 'text'} step={kind === 'sentTime' ? 1 : undefined} inputMode={amount ? 'numeric' : undefined} autoComplete="off"
        onBlur={amount ? event => { if (!edited.current) return; edited.current = false; const next = normalizeAmountInput(event.target.value); if (next !== event.target.value) onChange(next || null); } : undefined} />}
    {candidate && <div id={`${id}-origin`} className="purchase-review__origin">{/* «Recuperado» is the normal case; labelling every field hid the ones that need attention. */}{(changed || candidate.status !== 'recovered') && <div className="purchase-review__field-status"><span data-status={changed ? 'corrected' : candidate.status}>{changed ? 'Corregido' : statusLabels[candidate.status]}</span></div>}<details className="purchase-review__original"><summary><CaretRightIcon className="purchase-chevron" size={12} aria-hidden="true" />Ver original<span className="purchase-sr-only"> de {label}</span></summary><dl><div><dt>Valor extraído</dt><dd>{candidate.value ?? 'Sin dato'}</dd></div>{candidate.rawText !== null && candidate.rawText !== candidate.value && <div><dt>Texto fuente</dt><dd>{candidate.rawText}</dd></div>}{locationAvailable === false && <div><dt>Imagen</dt><dd>Sin ubicación disponible</dd></div>}</dl></details></div>}
    {issue && !changed && <p id={`${id}-issue`} className="purchase-review__issue">{issue}</p>}
    {error && <p id={`${id}-error`} className="purchase-review__error">{error}</p>}
  </div>;
}
