import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { toast } from 'sonner';
import type { ContractProblem, PurchaseDraft } from '@cenit/contracts/purchases';
import { getPurchase, updatePurchase } from '../api/purchases.js';
import { RecordForm } from '../components/RecordForm.js';
import { PurchaseReadError } from '../components/PurchaseReadError.js';
import { PurchaseEditSkeleton } from '../components/PurchaseSkeletons.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { payloadProblems, preparePayload } from '../model/submit.js';
import '../records.css';

export function PurchaseEdit() {
  const { id = '' } = useParams();
  const returnToList = usePurchaseReturnTo(), navigate = useNavigate(), guard = usePurchaseGuard(), client = useQueryClient();
  const detailPath = `/administracion/compras/${id}${returnToList.includes('?') ? returnToList.slice(returnToList.indexOf('?')) : ''}`;
  const query = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: ({ signal }) => getPurchase(id, signal) });
  const record = query.isError ? undefined : query.data?.data;
  const initial = useRef<{ draft: PurchaseDraft; version: number } | null>(null);
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const saved = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!record || initial.current) return;
    initial.current = { draft: { record: { ...record.record }, oracle: { ...record.oracle }, lines: record.lines.map(line => ({ ...line })) }, version: record.version };
    setDraft(initial.current.draft);
  }, [record]);
  const mutation = useMutation({ mutationFn: (input: Parameters<typeof updatePurchase>[1]) => updatePurchase(id, input), onSuccess: result => {
    if (!active.current) return;
    saved.current = true; client.setQueryData(['purchases', 'detail', id], result);
    void client.invalidateQueries({ queryKey: ['purchases'] });
    toast.success('Cambios guardados', { description: `Solicitud ${result.data.record.requestNumber}` });
    guard.leave(() => navigate(detailPath, { replace: true, state: { purchasesReturnTo: returnToList } }));
  } });
  const dirty = !!draft && !!initial.current && JSON.stringify(draft) !== JSON.stringify(initial.current.draft);
  useGuardChanges(dirty && !saved.current, mutation.isPending, () => undefined);
  function back(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    guard.request(() => navigate(detailPath, { state: { purchasesReturnTo: returnToList } }), event.currentTarget);
  }
  return <form className="purchase-records purchase-entry" noValidate aria-busy={mutation.isPending} onSubmit={event => {
    event.preventDefault();
    if (!draft || !initial.current || mutation.isPending || !dirty) return;
    const payload = preparePayload(draft), errors = payloadProblems(payload);
    setProblems(errors); if (!errors.length) mutation.mutate({ expectedVersion: initial.current.version, ...payload });
  }}>
    <Link className="purchase-back-link" to={detailPath} state={{ purchasesReturnTo: returnToList }} onClick={back}><ArrowLeftIcon size={16} aria-hidden="true" />Volver a la compra</Link>
    {query.isError ? <PurchaseReadError error={query.error} returnTo={returnToList} onRetry={() => { void query.refetch(); }} />
      : record?.source === 'contract_example' ? <div className="purchase-state"><p>Los ejemplos de demostración no se pueden editar.</p><Link className="cenit-button" to={detailPath} state={{ purchasesReturnTo: returnToList }}>Volver a la compra</Link></div> : <>
        <div className="purchase-page-heading"><div><h1>Editar compra</h1><p>Corrige la copia guardada en Cenit; en Oracle no cambia nada.</p></div>
          <div className="purchase-heading-actions"><button className="cenit-button cenit-button--primary" type="submit" disabled={!dirty || mutation.isPending}><CheckIcon size={16} weight="bold" aria-hidden="true" />{mutation.isPending ? 'Guardando cambios…' : 'Guardar cambios'}</button></div></div>
        {mutation.isError && <p className="purchase-state" role="alert">{mutation.error.message} Tus cambios siguen aquí.</p>}
        {draft ? <RecordForm purchaseId={id} heading={`Solicitud ${record?.record.requestNumber ?? ''}`} draft={draft} problems={problems} disabled={mutation.isPending}
          onChange={next => { setDraft(next); setProblems([]); mutation.reset(); }} /> : <PurchaseEditSkeleton />}
      </>}
  </form>;
}
