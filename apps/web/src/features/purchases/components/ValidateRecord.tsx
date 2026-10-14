import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validatePurchase } from '../api/purchases.js';

export function ValidateRecord({ id, version }: { id: string; version: number }) {
  const [confirming, setConfirming] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => validatePurchase(id, version), onSuccess: async () => {
    setConfirming(false); await client.invalidateQueries({ queryKey: ['purchases'] });
  } });
  if (!confirming) return <button type="button" onClick={() => setConfirming(true)}>Validar registro</button>;
  return <div className="purchase-confirm">
    <p>¿Confirmas la revisión de los datos registrados en Cenit?</p>
    <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Validando…' : 'Confirmar validación'}</button>
    <button type="button" disabled={mutation.isPending} onClick={() => { setConfirming(false); mutation.reset(); }}>Cancelar</button>
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
  </div>;
}
