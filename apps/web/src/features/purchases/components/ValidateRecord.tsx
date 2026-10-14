import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validatePurchase } from '../api/purchases.js';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog.js';
import { toast } from 'sonner';

export function ValidateRecord({ id, version }: { id: string; version: number }) {
  const [confirming, setConfirming] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => validatePurchase(id, version), onSuccess: async () => {
    if (!active.current) return;
    setConfirming(false); toast.success('Registro validado', { description: 'La revisión de los datos quedó registrada en Cenit.' });
    await client.invalidateQueries({ queryKey: ['purchases'] });
  } });
  return <><button type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setConfirming(true); }}>Validar registro</button>
    <ConfirmDialog open={confirming} title="Validar registro" description="¿Confirmas la revisión de los datos registrados en Cenit?"
      confirmLabel="Confirmar validación" cancelLabel="Cancelar" busy={mutation.isPending} onConfirm={() => mutation.mutate()}
      onCancel={() => { setConfirming(false); mutation.reset(); }}>
      <p className="cenit-dialog-note">Esta revisión no aprueba una compra en Oracle ni confirma su pago.</p>
      {mutation.isError && <p className="cenit-dialog-error" role="alert">{mutation.error.message}</p>}
    </ConfirmDialog>
  </>;
}
