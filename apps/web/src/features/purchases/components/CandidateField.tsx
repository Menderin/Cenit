import type { ExtractionCandidate } from '@cenit/contracts/purchases';
const statusLabels = { recovered: 'Recuperado', missing: 'Ausente', invalid: 'Inválido', ambiguous: 'Ambiguo' };
export function CandidateField({ id, label, candidate, value, onChange, error, long = false }: {
  id: string; label: string; candidate: ExtractionCandidate; value: string | null;
  onChange: (value: string | null) => void; error?: string; long?: boolean;
}) {
  const changed = value !== candidate.value;
  const props = { id, value: value ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value === '' ? null : event.target.value),
    maxLength: long ? 1000 : 255, 'aria-invalid': !!error, 'aria-describedby': `${id}-origin${error ? ` ${id}-error` : ''}` };
  return <div className="purchase-review__field">
    <label htmlFor={id}>{label}</label>
    {long ? <textarea {...props} rows={3} /> : <input {...props} type="text" autoComplete="off" />}
    <p id={`${id}-origin`} className="purchase-review__origin">{statusLabels[candidate.status]} · {changed ? 'Modificado manualmente' : 'Sin cambios'}<br />Original: {candidate.value ?? 'Sin valor candidato'}{candidate.rawText !== null && candidate.rawText !== candidate.value ? <><br />Texto fuente: {candidate.rawText}</> : null}</p>
    {error && <p id={`${id}-error`} className="purchase-review__error">{error}</p>}
  </div>;
}
