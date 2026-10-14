import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/csr/FloppyDisk';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validateCreatePurchase, type ContractProblem, type ExtractionReviewDraft, type CreatePurchase } from '@cenit/contracts/purchases';
import { createPurchase } from '../api/purchases.js';
import { emptyDraft, emptyLine, purchaseLabels, amountLabel, purchaseProblemLabel, purchaseExampleLabel } from '../model/fields.js';
import { usePurchaseTransfer } from '../model/transfer.js';
import { useAuth } from '../../auth/model/session.js';
import { usePurchaseDraft } from '../model/drafts.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { DateField } from '../../../shared/components/DateField.js';
import { toast } from 'sonner';
import '../records.css';

const required = new Set(['requestNumber', 'sentDate', 'description', 'totalAmount']);
export function PurchaseCreate() {
  const transfer = usePurchaseTransfer();
  const snapshot = usePurchaseDraft(), guard = usePurchaseGuard(), returnTo = usePurchaseReturnTo();
  const accountId = useAuth().session!.account.id;
  const [restored] = useState(() => snapshot.current?.accountId === accountId && snapshot.current.kind === 'create' ? snapshot.current : null);
  const [incoming] = useState(() => transfer.peek());
  const origin = restored?.origin ?? incoming?.origin ?? null;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => restored?.draft ?? incoming?.draft ?? emptyDraft());
  const [lineKeys, setLineKeys] = useState(() => restored?.lineKeys ?? draft.lines.map(() => crypto.randomUUID()));
  const initialLineKeys = useRef(new Set(lineKeys));
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(emptyDraft());
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const operationId = useRef(restored?.operationId ?? incoming?.operationId ?? crypto.randomUUID()), saved = useRef(false);
  useEffect(() => { if (incoming) transfer.consume(incoming.operationId); }, [incoming, transfer]);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const navigate = useNavigate(), client = useQueryClient();
  const mutation = useMutation({ mutationFn: createPurchase, onSuccess: result => {
    if (!active.current) return;
    saved.current = true;
    snapshot.current = null;
    void client.invalidateQueries({ queryKey: ['purchases'] });
    toast.success('Solicitud guardada', { description: 'El servidor confirmó el guardado. Puedes consultar el detalle.' });
    guard.leave(() => navigate(`/administracion/compras/${result.data.id}`, { replace: true, state: { purchasesReturnTo: returnTo } }));
  } });
  useGuardChanges(dirty && !saved.current, mutation.isPending, () => { snapshot.current = null; });
  useEffect(() => {
    if (!saved.current) snapshot.current = { kind: 'create', accountId, draft, lineKeys, origin, operationId: operationId.current };
  }, [accountId, draft, lineKeys, origin, snapshot]);
  useEffect(() => {
    if (!problems.length) return;
    const fields = form.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[aria-invalid="true"]');
    fields?.forEach(field => {
      let section = field.closest('details');
      while (section) { section.open = true; section = section.parentElement?.closest('details') ?? null; }
    });
    fields?.[0]?.focus();
  }, [problems]);
  function edit(group: 'header' | 'administrative' | 'lines', key: string, value: string, index = 0) {
    const next = value === '' ? null : value;
    setDraft(previous => group === 'lines' ? { ...previous, lines: previous.lines.map((line, i) => i === index ? { ...line, [key]: next } : line) } : { ...previous, [group]: { ...previous[group], [key]: next } });
    setProblems([]); mutation.reset();
  }
  function input(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, index = 0) {
    const id = `manual-${group}-${index}-${key}`, path = group === 'lines' ? `/lines/${index}/${key}` : `/${group}/${key}`;
    const problem = problems.find(entry => entry.path === path), mandatory = group === 'header' && required.has(key);
    const props = { id, value: value ?? '', required: mandatory, disabled: mutation.isPending, 'aria-invalid': !!problem, 'aria-describedby': problem ? `${id}-error` : undefined,
      maxLength: key === 'description' ? 1000 : 255, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => edit(group, key, event.target.value, index) };
    return <div className={`purchase-input${key === 'description' ? ' purchase-input--wide' : ''}`} key={key}><label htmlFor={id}>{purchaseLabels[key]}{mandatory ? ' *' : ''}<span className="purchase-sr-only">{group === 'lines' ? ` · ítem ${index + 1}` : ''}</span></label>
      {key === 'description' ? <textarea {...props} rows={3} /> : key === 'sentDate' ? <DateField {...props} label={purchaseLabels[key]!} onValueChange={next => edit(group, key, next, index)} /> : <input {...props} type={key === 'sentTime' ? 'time' : 'text'} step={key === 'sentTime' ? 1 : undefined} inputMode={['totalAmount', 'taxAmount', 'price', 'amount'].includes(key) ? 'numeric' : undefined} />}
      {problem && <p id={`${id}-error`} className="purchase-field-error">{problem.message}</p>}
    </div>;
  }
  return <section className="purchase-records"><Link className="purchase-back-link" to={returnTo} onClick={event => event.currentTarget.focus({ preventScroll: true })}><ArrowLeftIcon size={13} aria-hidden="true" />Volver a solicitudes</Link>
    <div className="purchase-page-heading"><div><h1>Nueva solicitud</h1><p>Los campos con * son obligatorios.</p></div>{origin?.type === 'contract_example' && <span className="purchase-origin-badge">Ejemplo de demostración · {purchaseExampleLabel(origin.exampleId)}</span>}</div>
    <form ref={form} noValidate onSubmit={event => {
      event.preventDefault(); if (mutation.isPending) return;
      const input = { operationId: operationId.current, ...(origin ? { origin } : {}), ...draft }, errors = validateCreatePurchase(input);
      setProblems(errors); if (!errors.length) mutation.mutate(input as CreatePurchase);
    }}>
      <fieldset><legend>Datos principales</legend><div className="purchase-input-grid purchase-main-grid">{['requestNumber', 'sentDate', 'totalAmount', 'description'].map(key => input('header', key, draft.header[key as keyof typeof draft.header]))}</div></fieldset>
      <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Datos complementarios</span><span className="purchase-section-hint">Opcional</span></summary><div className="purchase-item__body"><div className="purchase-input-grid">{Object.entries(draft.header).filter(([key]) => !required.has(key)).map(([key, value]) => input('header', key, value))}</div></div></details>
      <fieldset><legend>Ítems de la solicitud <span className="purchase-count">{draft.lines.length}</span></legend>
        {!draft.lines.length ? <div className="purchase-items-empty"><p>Agrega productos o servicios a la solicitud.</p><span>Opcional · Hasta 100 ítems</span></div> : draft.lines.map((line, index) => <details className="purchase-item" key={lineKeys[index]} open={!initialLineKeys.current.has(lineKeys[index]!)}>
          <summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span className="purchase-item__number">Ítem {index + 1}</span><span className="purchase-item__description">{line.description || 'Nuevo ítem'}</span><span className="purchase-item__provider">{line.provider || 'Sin proveedor'}</span><span className="purchase-item__amount">{amountLabel(line.amount)}</span></summary>
          <div className="purchase-item__body"><div className="purchase-input-grid">{Object.entries(line).map(([key, value]) => input('lines', key, value, index))}</div><button type="button" disabled={mutation.isPending} onClick={() => { setDraft(previous => ({ ...previous, lines: previous.lines.filter((_, i) => i !== index) })); setLineKeys(previous => previous.filter((_, i) => i !== index)); setProblems([]); mutation.reset(); }}>Eliminar ítem {index + 1}</button></div>
        </details>)}
        <button type="button" disabled={draft.lines.length >= 100 || mutation.isPending} onClick={() => { setDraft(previous => ({ ...previous, lines: [...previous.lines, emptyLine()] })); setLineKeys(previous => [...previous, crypto.randomUUID()]); setProblems([]); mutation.reset(); }}><PlusIcon size={14} aria-hidden="true" />Agregar ítem</button>
      </fieldset>
      <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={15} aria-hidden="true" /><span>Seguimiento administrativo</span><span className="purchase-section-hint">Opcional</span></summary><div className="purchase-item__body"><div className="purchase-input-grid">{Object.entries(draft.administrative).map(([key, value]) => input('administrative', key, value))}</div></div></details>
      {problems.length > 0 && <div className="purchase-error-summary" role="alert"><p>Revisa los campos antes de guardar.</p><ul>{problems.map((problem, index) => <li key={index}><strong>{purchaseProblemLabel(problem.path)}</strong>: {problem.message}</li>)}</ul></div>}
      {mutation.isError && <p role="alert">{mutation.error.message} El formulario conserva tus datos.</p>}
      <div className="purchase-form-footer"><button className="purchase-save" type="submit" disabled={mutation.isPending}><FloppyDiskIcon size={15} aria-hidden="true" />{mutation.isPending ? 'Guardando…' : 'Guardar solicitud'}</button>
        <button type="button" disabled={mutation.isPending} onClick={event => { event.currentTarget.focus({ preventScroll: true }); guard.request(() => navigate(returnTo)); }}>Cancelar</button>{dirty && <span>Borrador sin guardar</span>}</div>
    </form>
  </section>;
}
