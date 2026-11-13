import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { CircleIcon } from '@phosphor-icons/react/dist/csr/Circle';
import type { ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { amountLabel, normalizeAmountInput, purchaseLabels } from '../model/fields.js';

const required = ['requestNumber', 'sentDate', 'totalAmount', 'description'] as const;
const canonical = /^(0|[1-9]\d*)$/;

/** Read-only companion of the form. The item sum is information only: Cenit never requires it to match the document total. */
export function PurchaseFormSummary({ draft }: { draft: ExtractionReviewDraft }) {
  // Lo escrito con separador de miles cuenta como monto; un texto cualquiera no.
  const amounts = draft.lines.map(line => normalizeAmountInput(line.amount ?? '')).filter(value => canonical.test(value));
  const itemSum = amounts.reduce((sum, value) => sum + BigInt(value), 0n);
  const total = normalizeAmountInput(draft.header.totalAmount ?? ''), totalOk = canonical.test(total), totalInvalid = !!total.trim() && !totalOk;
  const missing = required.filter(key => key === 'totalAmount' ? !totalOk : !draft.header[key]?.trim());
  return <aside className="purchase-form-summary" aria-label="Resumen del registro">
    <p className="purchase-form-summary__label">Monto total · CLP</p>
    <p className="purchase-form-summary__amount">{totalOk ? amountLabel(total) : '—'}</p>
    <dl>
      <div><dt>Ítems</dt><dd>{draft.lines.length}</dd></div>
      <div><dt>Suma de ítems</dt><dd>{amounts.length ? amountLabel(itemSum.toString()) : '—'}</dd></div>
    </dl>
    <ul className="purchase-form-summary__checks">
      {required.map(key => <li key={key} data-done={!missing.includes(key)}>{missing.includes(key) ? <CircleIcon size={16} aria-hidden="true" /> : <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />}{purchaseLabels[key]}<span className="purchase-sr-only">{missing.includes(key) ? ': falta' : ': completo'}</span></li>)}
    </ul>
    <p className="purchase-form-summary__note">{totalInvalid ? 'El monto total debe tener sólo números.' : missing.length ? `Faltan ${missing.length} ${missing.length === 1 ? 'dato obligatorio' : 'datos obligatorios'}.` : 'Datos obligatorios completos. Los demás son opcionales.'}</p>
  </aside>;
}
