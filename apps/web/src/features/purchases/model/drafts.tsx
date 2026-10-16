import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { ExtractionReviewDraft, PurchaseOrigin } from '@cenit/contracts/purchases';
import { useLocation } from 'react-router';
import { useAuth } from '../../auth/model/session.js';

export type PurchaseDraft = { accountId: string; draft: ExtractionReviewDraft } & (
  { kind: 'create'; origin: PurchaseOrigin | null; operationId: string; lineKeys: string[] }
  | { kind: 'review'; exampleId: string }
);
const Context = createContext<RefObject<PurchaseDraft | null> | null>(null);

// Only temporary revalidation failures retain this tab's draft. Logout/expiry still discard it.
export function PurchaseDraftProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const snapshot = useRef<PurchaseDraft | null>(null);
  useEffect(() => {
    const expected = snapshot.current?.kind === 'create' ? '/administracion/compras/nueva' : '/administracion/compras/laboratorio';
    if (pathname !== expected) snapshot.current = null;
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
