import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/csr/FloppyDisk';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { toast } from 'sonner';
import { validateCreatePurchase, type ContractProblem, type CreatePurchase, type ExtractionCandidate, type ExtractionResponse, type ExtractionReviewDraft, type PurchaseOrigin } from '@cenit/contracts/purchases';
import { createPurchase } from '../api/purchases.js';
import { emptyDraft, emptyLine, purchaseLabels, amountLabel, purchaseProblemLabel } from '../model/fields.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseDraft } from '../model/drafts.js';
import { CandidateField } from './CandidateField.js';

const required = new Set(['requestNumber', 'sentDate', 'description', 'totalAmount']);
export function PurchaseForm({ draft, onChange, lineKeys, onLineKeysChange, operationId, origin, returnTo, original, activePath, onFieldFocus, disabled = false, onSavingChange, onSaved }: {
  draft: ExtractionReviewDraft; onChange: (draft: ExtractionReviewDraft) => void; lineKeys: string[]; onLineKeysChange: (keys: string[]) => void;
  operationId: string; origin: PurchaseOrigin | null; returnTo: string; original?: ExtractionResponse;
  activePath?: string; onFieldFocus?: (path: string) => void; disabled?: boolean;
  onSavingChange?: (saving: boolean) => void; onSaved?: () => void;
}) {
  const snapshot = usePurchaseDraft(), guard = usePurchaseGuard(), navigate = useNavigate(), client = useQueryClient();
  const form = useRef<HTMLFormElement>(null), saved = useRef(false), active = useRef(true);
  const initialKeys = useRef(new Set(lineKeys));
  const dirty = !!original || JSON.stringify(draft) !== JSON.stringify(emptyDraft());
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const mutation = useMutation({ mutationFn: createPurchase, onSuccess: result => {
    if (!active.current) return;
    saved.current = true; snapshot.current = null; onSaved?.();
    void client.invalidateQueries({ queryKey: ['purchases'] });
    toast.success('Registro guardado');
    guard.leave(() => navigate(`/administracion/compras/${result.data.id}`, { replace: true, state: { purchasesReturnTo: returnTo } }));
  } });
  useEffect(() => { onSavingChange?.(mutation.isPending); }, [mutation.isPending, onSavingChange]);
  useGuardChanges(dirty && !saved.current, mutation.isPending, () => { snapshot.current = null; });
  useEffect(() => {
    if (!problems.length) return;
    const fields = form.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[aria-invalid="true"]');
    fields?.forEach(field => { let section = field.closest('details'); while (section) { section.open = true; section = section.parentElement?.closest('details') ?? null; } });
    fields?.[0]?.focus();
  }, [problems]);
  function edit(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, index = 0) {
    onChange(group === 'lines' ? { ...draft, lines: draft.lines.map((line, i) => i === index ? { ...line, [key]: value } : line) } : { ...draft, [group]: { ...draft[group], [key]: value } });
    setProblems([]); mutation.reset();
  }
  function field(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, index = 0) {
    const path = group === 'lines' ? `/lines/${index}/${key}` : `/${group}/${key}`;
    const sourceIndex = group === 'lines' && lineKeys[index]?.startsWith('capture-') ? Number(lineKeys[index]!.slice(8)) : -1;
    const sourcePath = group === 'lines' ? `/lines/${sourceIndex}/${key}` : path;
    const candidates = group === 'lines' ? original?.data.lines[sourceIndex] : original?.data[group];
    const candidate = candidates?.[key as keyof typeof candidates] as ExtractionCandidate | undefined;
    return <CandidateField key={key} id={`${original ? 'review' : 'manual'}-${group}-${index}-${key}`} field={key}
      label={`${purchaseLabels[key]}${group === 'lines' ? ` · ítem ${index + 1}` : ''}`} value={value}
      required={group === 'header' && required.has(key)} disabled={disabled || mutation.isPending} long={key === 'description'}
      candidate={candidate} error={problems.find(problem => problem.path === path)?.message}
      issue={original?.data.issues.find(issue => issue.path === sourcePath)?.message}
      sourcePath={candidate ? sourcePath : undefined} active={!!candidate && activePath === sourcePath}
      onFocus={() => onFieldFocus?.(candidate ? sourcePath : '')}
      locationAvailable={original ? original.data.regions?.some(region => region.path === sourcePath) ?? false : undefined}
      onChange={value => edit(group, key, value, index)} />;
  }
  return <form ref={form} className="purchase-editor" noValidate aria-busy={mutation.isPending} onSubmit={event => {
    event.preventDefault(); if (mutation.isPending || disabled) return;
    const input = { operationId, ...(origin ? { origin } : {}), ...draft }, errors = validateCreatePurchase(input);
    setProblems(errors); if (!errors.length) mutation.mutate(input as CreatePurchase);
  }}>
    <fieldset><legend>Datos principales</legend><div className="purchase-input-grid purchase-main-grid">{['requestNumber', 'sentDate', 'totalAmount', 'description'].map(key => field('header', key, draft.header[key as keyof typeof draft.header]))}</div></fieldset>
    <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={16} aria-hidden="true" /><span>Datos complementarios</span><span className="purchase-section-hint">Opcional</span></summary><div className="purchase-item__body"><div className="purchase-input-grid">{Object.entries(draft.header).filter(([key]) => !required.has(key)).map(([key, value]) => field('header', key, value))}</div></div></details>
    <fieldset><legend>Ítems de la solicitud <span className="purchase-count">{draft.lines.length}</span></legend>
      {!draft.lines.length ? <div className="purchase-items-empty"><p>Agrega productos o servicios si aparecen en el documento.</p><span>Opcional · Hasta 100 ítems</span></div> : draft.lines.map((line, index) => <details className="purchase-item" key={lineKeys[index]} open={!lineKeys[index]?.startsWith('capture-') && !initialKeys.current.has(lineKeys[index]!)}>
        <summary><CaretRightIcon className="purchase-chevron" size={16} aria-hidden="true" /><span className="purchase-item__number">Ítem {index + 1}</span><span className="purchase-item__description">{line.description || 'Nuevo ítem'}</span><span className="purchase-item__provider">{line.provider || 'Sin proveedor'}</span><span className="purchase-item__amount">{amountLabel(line.amount)}</span></summary>
        <div className="purchase-item__body"><div className="purchase-input-grid">{Object.entries(line).map(([key, value]) => field('lines', key, value, index))}</div><button type="button" disabled={disabled || mutation.isPending} onClick={() => {
          onChange({ ...draft, lines: draft.lines.filter((_, i) => i !== index) }); onLineKeysChange(lineKeys.filter((_, i) => i !== index)); setProblems([]); mutation.reset();
        }}>Eliminar ítem {index + 1}</button></div>
      </details>)}
      <button type="button" disabled={disabled || mutation.isPending || draft.lines.length >= 100} onClick={() => {
        onChange({ ...draft, lines: [...draft.lines, emptyLine()] }); onLineKeysChange([...lineKeys, crypto.randomUUID()]); setProblems([]); mutation.reset();
      }}><PlusIcon size={16} aria-hidden="true" />Agregar ítem</button>
    </fieldset>
    <details className="purchase-item purchase-disclosure"><summary><CaretRightIcon className="purchase-chevron" size={16} aria-hidden="true" /><span>Seguimiento administrativo</span><span className="purchase-section-hint">Opcional</span></summary><div className="purchase-item__body"><div className="purchase-input-grid">{Object.entries(draft.administrative).map(([key, value]) => field('administrative', key, value))}</div></div></details>
    {problems.length > 0 && <div className="purchase-error-summary" role="alert"><p>Completa o corrige los campos indicados.</p><ul>{problems.map((problem, index) => <li key={index}><strong>{purchaseProblemLabel(problem.path)}</strong>: {problem.message}</li>)}</ul></div>}
    {mutation.isError && <p role="alert">{mutation.error.message} El formulario conserva tus datos.</p>}
    <div className="purchase-form-footer"><button className="purchase-save" type="submit" disabled={disabled || mutation.isPending}><FloppyDiskIcon size={18} aria-hidden="true" />{mutation.isPending ? 'Guardando…' : 'Guardar registro'}</button>
      <button type="button" disabled={mutation.isPending} onClick={event => { event.currentTarget.focus({ preventScroll: true }); guard.request(() => navigate(returnTo), event.currentTarget); }}>Cancelar</button>{dirty && <span>Borrador sin guardar</span>}</div>
  </form>;
}
