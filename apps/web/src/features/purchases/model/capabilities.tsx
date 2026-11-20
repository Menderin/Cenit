import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PurchaseCapabilities } from '@cenit/contracts/purchases';
import { getPurchaseCapabilities } from '../api/purchases.js';

const Capabilities = createContext<PurchaseCapabilities | null>(null);
export function PurchaseCapabilitiesProvider({ children, fallback }: { children: ReactNode | ((capabilities: PurchaseCapabilities) => ReactNode); fallback: ReactNode }) {
  const query = useQuery({ queryKey: ['purchases', 'capabilities'], queryFn: ({ signal }) => getPurchaseCapabilities(signal), staleTime: Infinity });
  if (!query.data) return query.isError ? <section role="alert"><p>{query.error.message}</p><button className="cenit-button" onClick={() => { void query.refetch(); }}>Reintentar</button></section>
    : fallback;
  const capabilities = query.data.data;
  return <Capabilities.Provider value={capabilities}>{typeof children === 'function' ? children(capabilities) : children}</Capabilities.Provider>;
}
export function usePurchaseCapabilities() {
  const value = useContext(Capabilities);
  if (!value) throw new Error('Falta la configuración de Compras.');
  return value;
}
