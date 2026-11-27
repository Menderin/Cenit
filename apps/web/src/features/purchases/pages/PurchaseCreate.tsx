import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { toast } from 'sonner';
import { emptyDraft, type ContractProblem, type PurchaseDraft, type RecordSources } from '@cenit/contracts/purchases';
import { createPurchase } from '../api/purchases.js';
import { RecordForm } from '../components/RecordForm.js';
import { useAuth } from '../../auth/model/session.js';
import { usePurchaseDraft } from '../model/drafts.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { payloadProblems, preparePayload, todayInSantiago } from '../model/submit.js';
import '../records.css';

const fresh = (): PurchaseDraft => { const draft = emptyDraft(); draft.record.recordDate = todayInSantiago(); return draft; };

export function PurchaseCreate() {
  const snapshot = usePurchaseDraft(), guard = usePurchaseGuard(), client = useQueryClient();
  const returnTo = usePurchaseReturnTo(), navigate = useNavigate(), accountId = useAuth().session!.account.id;
  const [restored] = useState(() => snapshot.current?.accountId === accountId && snapshot.current.kind === 'create' ? snapshot.current : null);
  const [initial, setInitial] = useState(fresh);
  const [draft, setDraft] = useState<PurchaseDraft>(() => restored?.draft ?? initial);
  const [sources, setSources] = useState<RecordSources>({});
  const [operationId, setOperationId] = useState(() => restored?.operationId ?? crypto.randomUUID());
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const another = useRef(false), saved = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (!saved.current) snapshot.current = { kind: 'create', accountId, draft, operationId }; }, [accountId, draft, operationId, snapshot]);
  const mutation = useMutation({ mutationFn: createPurchase, onSuccess: result => {
    if (!active.current) return;
    void client.invalidateQueries({ queryKey: ['purchases'] });
    toast.success('Compra guardada', { description: `Solicitud ${result.data.record.requestNumber}` });
    if (another.current) {
      const next = fresh(); setInitial(next); setDraft(next); setSources({}); setOperationId(crypto.randomUUID()); setProblems([]);
      window.scrollTo({ top: 0 });
      return;
    }
    saved.current = true; snapshot.current = null;
    guard.leave(() => navigate(`/administracion/compras/${result.data.id}`, { replace: true, state: { purchasesReturnTo: returnTo } }));
  } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useGuardChanges(dirty && !saved.current, mutation.isPending, () => { snapshot.current = null; });
  function submit(more: boolean) {
    if (mutation.isPending) return;
    const payload = preparePayload(draft), errors = payloadProblems(payload);
    setProblems(errors); if (errors.length) return;
    another.current = more; mutation.mutate({ operationId, origin: { type: 'manual' }, ...payload });
  }
  return <form className="purchase-records purchase-entry" noValidate aria-busy={mutation.isPending} onSubmit={event => { event.preventDefault(); submit(false); }}>
    <Link className="purchase-back-link" to={returnTo} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); guard.request(() => navigate(returnTo), event.currentTarget); }}><ArrowLeftIcon size={16} aria-hidden="true" />Volver al registro</Link>
    <div className="purchase-page-heading"><div><h1>Registrar a mano</h1><p>Los mismos datos de tu planilla. Cenit completa lo que puede a partir de lo que escribes.</p></div>
      <div className="purchase-heading-actions">
        <button className="cenit-button" type="button" disabled={mutation.isPending} onClick={() => submit(true)}>Guardar y registrar otra</button>
        <button className="cenit-button cenit-button--primary" type="submit" disabled={mutation.isPending}><CheckIcon size={16} weight="bold" aria-hidden="true" />{mutation.isPending ? 'Guardando…' : 'Guardar compra'}</button>
      </div></div>
    {mutation.isError && <p className="purchase-state" role="alert">{mutation.error.message} Tus datos siguen aquí.</p>}
    <RecordForm heading="La fila que se guardará" draft={draft} sources={sources} problems={problems} disabled={mutation.isPending}
      onChange={(next, nextSources) => { setDraft(next); setSources(nextSources); setProblems([]); mutation.reset(); }}
      note="Completa Fecha, Nº Documento, DETALLE, Monto y Documento. Los códigos se pueden completar después." />
  </form>;
}
