import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PAYMENT_SITUATIONS } from '@cenit/contracts/purchases';
import { setPaymentSituation } from '../api/purchases.js';

const [PENDING, PAID] = PAYMENT_SITUATIONS;
/** Marca una compra como pagada o la devuelve a pendiente; confirma sólo después del servidor. */
export function usePaymentToggle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (record: { id: string; version: number; paymentSituation: string; requestNumber: string }) =>
      setPaymentSituation(record.id, record.version, record.paymentSituation === PAID ? PENDING : PAID),
    onSuccess: async result => {
      toast.success(result.data.record.paymentSituation === PAID ? 'Compra marcada como pagada' : 'Compra marcada como pendiente', { description: `Solicitud ${result.data.record.requestNumber}` });
      client.setQueryData(['purchases', 'detail', result.data.id], result);
      await client.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: error => { toast.error('No se pudo cambiar la situación de pago', { description: error.message }); },
  });
}
