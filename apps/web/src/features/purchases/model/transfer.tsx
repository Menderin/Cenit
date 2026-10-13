import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { ExtractionReviewDraft, PurchaseOrigin } from '@cenit/contracts/purchases';

type Transfer = { draft: ExtractionReviewDraft; origin: PurchaseOrigin; operationId: string };
type Channel = { put: (draft: ExtractionReviewDraft, origin: PurchaseOrigin) => void; peek: () => Transfer | null; consume: (operationId: string) => void };
const Context = createContext<Channel | null>(null);

// Mounted only for one authenticated account; logout/expiry unmounts the channel.
// Consumption happens after commit so StrictMode cannot lose a draft during rendering.
export function PurchaseTransferProvider({ children }: { children: ReactNode }) {
  const pending = useRef<Transfer | null>(null);
  const channel = useRef<Channel>({
    put: (draft, origin) => { pending.current = { draft: structuredClone(draft), origin: structuredClone(origin), operationId: crypto.randomUUID() }; },
    peek: () => pending.current ? structuredClone(pending.current) : null,
    consume: operationId => { if (pending.current?.operationId === operationId) pending.current = null; },
  });
  return <Context.Provider value={channel.current}>{children}</Context.Provider>;
}
export function usePurchaseTransfer() {
  const channel = useContext(Context);
  if (!channel) throw new Error('Purchase transfer requires an authenticated administrative area.');
  return channel;
}
