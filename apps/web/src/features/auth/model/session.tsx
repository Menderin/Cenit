import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import type { LoginRequest, SessionResponse } from '@cenit/contracts/auth';
import { getSession, signIn, signOut } from '../api/auth.js';
import { signInGoogle } from '../api/google.js';
import { HttpError } from '../../../shared/lib/http.js';

type Session = SessionResponse['data'];
type Status = 'checking' | 'authenticated' | 'guest' | 'error' | 'closing' | 'logout-error';
type State = { status: Status; session: Session | null; message: string; notice?: 'signed-out' | 'expired' };
type Auth = State & { login: (input: LoginRequest) => Promise<void>; loginGoogle: (credential: string, signal: AbortSignal) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> };
const Context = createContext<Auth | null>(null);
const expiredMessage = 'Tu sesión ya no es válida. Vuelve a iniciar sesión.';
export const destination = (session: Session) => session.account.role === 'administrativo' ? '/administracion' : '/academico';

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const epoch = useRef(0);
  const [state, setState] = useState<State>({ status: 'checking', session: null, message: '' });
  const hadSession = useRef(false);
  const clear = useCallback(() => {
    epoch.current++;
    void client.cancelQueries();
    client.clear();
  }, [client]);
  const invalidate = useCallback(() => {
    clear(); hadSession.current = false;
    setState({ status: 'guest', session: null, message: expiredMessage, notice: 'expired' });
  }, [clear]);
  const refresh = useCallback(async () => {
    const generation = ++epoch.current;
    // Revalidate an active session in the background so a valid focus change does
    // not destroy an unsaved form. Initial checks still hide all protected content.
    setState(previous => previous.status === 'authenticated' ? previous : ({ status: 'checking', session: previous.session, message: '' }));
    try {
      const session = await client.fetchQuery({ queryKey: ['auth', 'session'], queryFn: ({ signal }) => getSession(signal), staleTime: 0 });
      if (epoch.current !== generation) return;
      if (Date.parse(session.expiresAt) <= Date.now()) { invalidate(); return; }
      hadSession.current = true;
      setState({ status: 'authenticated', session, message: '' });
    } catch (error) {
      if (epoch.current !== generation) return;
      if (error instanceof HttpError && error.status === 401) {
        const message = hadSession.current ? expiredMessage : '';
        clear(); hadSession.current = false;
        setState({ status: 'guest', session: null, message, notice: message ? 'expired' : undefined });
      } else {
        // Keep only the previous identity/deadline; App hides all protected content.
        // The deadline still runs while disconnected, and the draft stays private until revalidated.
        clear(); setState(previous => ({ status: 'error', session: previous.session, message: 'No se pudo comprobar la sesión. Intenta nuevamente.' }));
      }
    }
  }, [client, clear, invalidate]);
  useEffect(() => { void refresh(); return () => clear(); }, [refresh, clear]);
  useEffect(() => {
    // Hide identity before a document can enter the browser's back/forward cache.
    const hide = () => { flushSync(() => { clear(); setState({ status: 'checking', session: null, message: '' }); }); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => { window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); };
  }, [clear, refresh]);
  useEffect(() => {
    if (!state.session) return;
    const timer = window.setTimeout(invalidate, Math.max(0, Date.parse(state.session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [state.session?.expiresAt, invalidate]);
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    window.addEventListener('cenit:unauthenticated', invalidate);
    return () => { window.removeEventListener('focus', focus); window.removeEventListener('cenit:unauthenticated', invalidate); };
  }, [state.status, invalidate, refresh]);
  const login = async (input: LoginRequest) => {
    const generation = ++epoch.current;
    const session = await signIn(input);
    if (generation !== epoch.current) return;
    if (Date.parse(session.expiresAt) <= Date.now()) { invalidate(); return; }
    clear();
    client.setQueryData(['auth', 'session'], session); hadSession.current = true;
    setState({ status: 'authenticated', session, message: '' });
  };
  const logout = async () => {
    clear(); const generation = epoch.current;
    hadSession.current = false;
    setState({ status: 'closing', session: null, message: '' });
    try {
      await signOut();
      if (epoch.current === generation) setState({ status: 'guest', session: null, message: 'Sesión cerrada.', notice: 'signed-out' });
    } catch {
      if (epoch.current === generation) setState({ status: 'logout-error', session: null, message: 'No se pudo confirmar el cierre de sesión.' });
    }
  };
  const loginGoogle = async (credential: string, signal: AbortSignal) => {
    const generation = ++epoch.current;
    const session = await signInGoogle(credential, signal);
    if (signal.aborted || generation !== epoch.current) return;
    if (Date.parse(session.expiresAt) <= Date.now()) { invalidate(); return; }
    clear();
    client.setQueryData(['auth', 'session'], session); hadSession.current = true;
    setState({ status: 'authenticated', session, message: '' });
  };
  return <Context.Provider value={{ ...state, login, loginGoogle, logout, refresh }}>{children}</Context.Provider>;
}
export function useAuth() { const auth = useContext(Context); if (!auth) throw new Error('AuthProvider requerido'); return auth; }
