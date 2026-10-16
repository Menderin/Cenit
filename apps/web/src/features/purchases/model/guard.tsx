import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';

type Guard = { dirty: boolean; busy: boolean; discard: () => void };
type Prompt = { origin: HTMLElement | null; action: () => void; cancel?: () => void; busy: boolean; title: string; description: string; confirmLabel: string };
type Channel = {
  register: (guard: Guard) => () => void;
  request: (action: () => void, origin: HTMLElement | null, options?: Partial<Pick<Prompt, 'title' | 'description' | 'confirmLabel'>>) => void;
  leave: (action: () => void) => void;
};
const Context = createContext<Channel | null>(null);
function visibleOrigin(origin: HTMLElement | null) {
  if (origin?.isConnected) {
    const rect = origin.getBoundingClientRect();
    let visible = rect.width > 0 && rect.height > 0 && rect.top >= 16 && rect.left >= 16 && rect.bottom <= window.innerHeight - 16 && rect.right <= window.innerWidth - 16;
    for (let parent = origin.parentElement; parent && visible; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflow)) continue;
      const bounds = parent.getBoundingClientRect();
      visible = rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.left >= bounds.left && rect.right <= bounds.right;
    }
    if (visible) return origin;
  }
  const fallback = document.querySelector<HTMLElement>('[data-confirm-fallback]');
  fallback?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return fallback;
}
const defaults = { title: 'Descartar cambios', description: 'Hay datos sin guardar. Si sales, se descartarán.', confirmLabel: 'Descartar y salir' };

export function PurchaseGuardProvider({ children }: { children: ReactNode }) {
  const guard = useRef<Guard | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => Boolean(guard.current && (guard.current.dirty || guard.current.busy))
    && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search);
  useEffect(() => {
    if (blocker.state === 'blocked') setPrompt({ ...defaults, origin: visibleOrigin(null), busy: !!guard.current?.busy, action: blocker.proceed, cancel: blocker.reset });
  }, [blocker]);
  const register = useCallback((next: Guard) => {
    guard.current = next;
    return () => { if (guard.current === next) guard.current = null; };
  }, []);
  const request = useCallback((action: () => void, origin: HTMLElement | null, options = {}) => {
    if (!guard.current?.dirty && !guard.current?.busy) { guard.current?.discard(); action(); return; }
    setPrompt({ ...defaults, ...options, origin: visibleOrigin(origin), action, busy: !!guard.current?.busy });
  }, []);
  const leave = (action: () => void) => {
    guard.current = null; setPrompt(null);
    if (blocker.state === 'blocked') blocker.reset();
    action();
  };
  const cancel = () => { prompt?.cancel?.(); setPrompt(null); };
  return <Context.Provider value={{ register, request, leave }}>
    {children}
    <ContextualConfirm open={prompt !== null} origin={prompt?.origin ?? null} caution title={prompt?.busy ? 'Guardado en curso' : prompt?.title ?? defaults.title}
      description={prompt?.busy ? 'Espera a que el servidor confirme la operación antes de salir.' : prompt?.description ?? defaults.description}
      confirmLabel={prompt?.busy ? undefined : prompt?.confirmLabel} cancelLabel={prompt?.busy ? 'Volver al formulario' : 'Seguir editando'}
      onCancel={cancel} onConfirm={() => { if (!prompt || guard.current?.busy) return; guard.current?.discard(); guard.current = null; const action = prompt.action; setPrompt(null); action(); }} />
  </Context.Provider>;
}
export function usePurchaseGuard() {
  const channel = useContext(Context);
  if (!channel) throw new Error('PurchaseGuardProvider requerido');
  return channel;
}
export function useGuardChanges(dirty: boolean, busy: boolean, discard: () => void) {
  const { register } = usePurchaseGuard();
  useLayoutEffect(() => register({ dirty, busy, discard }), [dirty, busy, discard, register]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
}
