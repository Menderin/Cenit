import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { CaptureDateSource, ExtractionResponse, PurchaseDraft, RecordSources } from '@cenit/contracts/purchases';
import { useLocation } from 'react-router';
import { useAuth } from '../../auth/model/session.js';

/** Una captura en la cola de revisión: su imagen, lo que Cenit leyó y la fila que se guardará. */
export type CaptureItem = {
  key: string; file: File; width: number; height: number; operationId: string;
  status: 'waiting' | 'reading' | 'ready' | 'failed' | 'saved';
  error: string | null; extraction: ExtractionResponse | null; draft: PurchaseDraft; sources: RecordSources;
  dateSource: CaptureDateSource;
  /** Se completa a mano mirando la imagen cuando no se pudo leer; se guarda como ingreso manual. */
  manual: boolean; savedId: string | null;
};
export type PurchaseDraftSnapshot = { accountId: string } & (
  { kind: 'create'; draft: PurchaseDraft; operationId: string }
  | { kind: 'capture'; items: CaptureItem[]; selected: string | null }
);
const Context = createContext<RefObject<PurchaseDraftSnapshot | null> | null>(null);
const paths = { create: '/administracion/compras/nueva', capture: '/administracion/compras/captura' } as const;

// Los borradores viven sólo en la memoria de esta pestaña y se descartan al salir, cerrar sesión o cambiar de cuenta.
export function PurchaseDraftProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const snapshot = useRef<PurchaseDraftSnapshot | null>(null);
  useEffect(() => {
    if (snapshot.current && pathname !== paths[snapshot.current.kind]) snapshot.current = null;
  }, [pathname]);
  useEffect(() => {
    if (['guest', 'closing', 'logout-error'].includes(auth.status) || (auth.session && snapshot.current?.accountId !== auth.session.account.id)) snapshot.current = null;
  }, [auth.status, auth.session?.account.id]);
  useEffect(() => {
    const clear = () => { snapshot.current = null; };
    window.addEventListener('pagehide', clear);
    return () => { window.removeEventListener('pagehide', clear); clear(); };
  }, []);
  return <Context.Provider value={snapshot}>{children}</Context.Provider>;
}
export function usePurchaseDraft() {
  const snapshot = useContext(Context);
  if (!snapshot) throw new Error('PurchaseDraftProvider requerido');
  return snapshot;
}
