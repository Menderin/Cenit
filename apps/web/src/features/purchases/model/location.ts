import { useLocation } from 'react-router';

export function usePurchaseReturnTo() {
  const { state } = useLocation();
  const target: unknown = state?.purchasesReturnTo;
  return typeof target === 'string' && (target === '/administracion/compras' || target.startsWith('/administracion/compras?')) ? target : '/administracion/compras';
}
