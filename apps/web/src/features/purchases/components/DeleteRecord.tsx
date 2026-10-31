import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { toast } from 'sonner';
import { usePurchaseCapabilities } from '../model/capabilities.js';
import { deletePurchase } from '../api/purchases.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';

export function DeleteRecord({ id, version, requestNumber, fallbackFocus, onDeleted }: {
  id: string; version: number; requestNumber: string; fallbackFocus: RefObject<HTMLElement | null>; onDeleted?: () => void;
}) {
  const { sheetsSyncEnabled } = usePurchaseCapabilities();
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), selected = useRef({ id, version });
  const sending = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: (record: { id: string; version: number }) => deletePurchase(record.id, record.version),
    onSettled: () => { sending.current = false; }, onSuccess: async () => {
      if (!active.current) return;
      setConfirming(false); toast.success('Registro eliminado', { description: `Se eliminó la solicitud ${requestNumber} de Cenit.` });
      // Preserve the confirmation anchor until its exit finishes, as in validation.
      await new Promise(resolve => window.setTimeout(resolve, 150));
      if (!active.current) return;
      client.removeQueries({ queryKey: ['purchases', 'detail', id], exact: true });
      onDeleted?.();
      await client.invalidateQueries({ queryKey: ['purchases'] });
    },
  });
  useEffect(() => { setConfirming(false); }, [id, version]);
  async function refresh() {
    setConfirming(false);
    await new Promise(resolve => window.setTimeout(resolve, 150));
    if (active.current) { mutation.reset(); await client.invalidateQueries({ queryKey: ['purchases'] }); }
  }
  return <><button type="button" className="cenit-button cenit-button--icon cenit-button--quiet" ref={trigger} disabled={mutation.isPending} aria-label="Eliminar" title="Eliminar registro" aria-haspopup="dialog" aria-expanded={confirming} onClick={event => {
    event.currentTarget.focus({ preventScroll: true }); selected.current = { id, version }; mutation.reset(); setConfirming(true);
  }}><TrashIcon size={16} aria-hidden="true" /></button>
    <ContextualConfirm open={confirming} origin={trigger.current} fallbackFocus={fallbackFocus} title={`¿Eliminar ${requestNumber}?`}
      description={`Se eliminarán definitivamente esta copia de Cenit y todos sus ítems.${sheetsSyncEnabled ? ' También se retirará su copia de Google Sheets cuando se complete la sincronización.' : ''} Esta acción no se puede deshacer.`}
      caution destructive confirmLabel="Eliminar registro" cancelLabel="Cancelar" busy={mutation.isPending} busyLabel="Eliminando…"
      onConfirm={() => {
        if (sending.current || !confirming) return;
        if (!trigger.current?.isConnected || selected.current.id !== id || selected.current.version !== version) { setConfirming(false); return; }
        sending.current = true; mutation.mutate(selected.current);
      }} onCancel={() => { setConfirming(false); mutation.reset(); }}>
      {mutation.isError && <div className="cenit-dialog-error" role="alert"><p>{mutation.error.message}</p><button className="cenit-button cenit-button--outline" type="button" onClick={() => { void refresh(); }}>Actualizar datos</button></div>}
    </ContextualConfirm>
  </>;
}
