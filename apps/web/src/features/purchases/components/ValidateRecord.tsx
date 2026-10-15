import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validatePurchase } from '../api/purchases.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';
import { toast } from 'sonner';

export function ValidateRecord({ id, version, requestNumber, fallbackFocus }: { id: string; version: number; requestNumber: string; fallbackFocus: RefObject<HTMLElement | null> }) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = useRef({ id, version });
  const sending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: (record: { id: string; version: number }) => validatePurchase(record.id, record.version), onSettled: () => { sending.current = false; }, onSuccess: async () => {
    if (!active.current) return;
    setConfirming(false); toast.success('Registro validado', { description: 'La revisión de los datos quedó registrada en Cenit.' });
    await client.invalidateQueries({ queryKey: ['purchases'] });
  } });
  useEffect(() => { setConfirming(false); }, [id, version]);
  return <><button type="button" ref={trigger} aria-haspopup="dialog" aria-expanded={confirming} onClick={event => {
    event.currentTarget.focus({ preventScroll: true }); selected.current = { id, version }; setConfirming(true);
  }}>Validar registro</button>
    <ContextualConfirm open={confirming} origin={trigger.current} fallbackFocus={fallbackFocus} title={`¿Validar ${requestNumber}?`} description="La revisión de los datos quedará registrada en Cenit."
      confirmLabel="Validar registro" cancelLabel="Cancelar" busy={mutation.isPending} busyLabel="Validando…" onConfirm={() => {
        if (sending.current || !confirming) return;
        if (!trigger.current?.isConnected || selected.current.id !== id || selected.current.version !== version) { setConfirming(false); return; }
        sending.current = true; mutation.mutate(selected.current);
      }}
      onCancel={() => { setConfirming(false); mutation.reset(); }}>
      <p className="cenit-dialog-note">Esta revisión no aprueba una compra en Oracle ni confirma su pago.</p>
      {mutation.isError && <p className="cenit-dialog-error" role="alert">{mutation.error.message}</p>}
    </ContextualConfirm>
  </>;
}
