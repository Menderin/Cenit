import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GooglePurpose } from '@cenit/contracts/auth';
import { createGoogleChallenge, getGoogleAvailability, linkGoogle } from '../api/google.js';
import { loadGoogleClient, type GoogleClient } from '../model/google-client.js';
import { useAuth } from '../model/session.js';
import { HttpError } from '../../../shared/lib/http.js';
import './google.css';

export function useGoogleAvailability() {
  return useQuery({ queryKey: ['auth', 'google'], queryFn: ({ signal }) => getGoogleAvailability(signal), retry: false, staleTime: Infinity });
}

export function GoogleAccess({ clientId, purpose, disabled = false, onBusy, onLinked }: {
  clientId: string; purpose: GooglePurpose; disabled?: boolean; onBusy?: (busy: boolean) => void; onLinked?: () => void;
}) {
  const auth = useAuth();
  const [stage, setStage] = useState<'idle' | 'loading' | 'choosing' | 'verifying' | 'linked'>('idle');
  const [message, setMessage] = useState('');
  const button = useRef<HTMLDivElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const attempt = useRef<AbortController | null>(null);
  const client = useRef<GoogleClient | null>(null);
  const expiry = useRef<number | undefined>(undefined);
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  useEffect(() => { void prepare(); }, [clientId, purpose]);
  useEffect(() => { if (stage === 'idle' && message) retry.current?.focus(); }, [stage, message]);

  function cancel() {
    attempt.current?.abort(); attempt.current = null;
    clearTimeout(expiry.current);
    client.current?.cancel(); client.current?.disableAutoSelect();
    button.current?.replaceChildren();
    busyCallback.current?.(false);
  }
  useEffect(() => () => {
    attempt.current?.abort(); clearTimeout(expiry.current);
    client.current?.cancel(); client.current?.disableAutoSelect();
    busyCallback.current?.(false);
  }, []);

  async function prepare() {
    if (disabled || stage === 'loading' || stage === 'verifying') return;
    cancel();
    const controller = new AbortController(); attempt.current = controller;
    setMessage(''); setStage('loading');
    try {
      const sdk = await loadGoogleClient();
      if (controller.signal.aborted) return;
      client.current = sdk;
      const challenge = await createGoogleChallenge(purpose, controller.signal);
      if (controller.signal.aborted) return;
      let submitted = false;
      sdk.initialize({ client_id: clientId, nonce: challenge.nonce, auto_select: false, ux_mode: 'popup', callback: response => {
        if (controller.signal.aborted || submitted) return;
        submitted = true;
        clearTimeout(expiry.current);
        button.current?.replaceChildren();
        setStage('verifying'); busyCallback.current?.(true);
        void complete(response.credential, controller);
      } });
      sdk.renderButton(button.current!, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', locale: 'es',
        text: purpose === 'login' ? 'signin_with' : 'continue_with',
        logo_alignment: purpose === 'login' ? 'center' : 'left',
        width: Math.min(400, button.current!.parentElement!.clientWidth),
      });
      setStage('choosing');
      expiry.current = window.setTimeout(() => {
        cancel(); setStage('idle'); setMessage('El intento venció. Vuelve a intentarlo.'); retry.current?.focus();
      }, Math.max(0, Date.parse(challenge.expiresAt) - Date.now()));
    } catch (error) { await failure(error, controller); }
  }
  async function failure(error: unknown, controller: AbortController) {
    if (controller.signal.aborted) return;
    cancel(); setStage('idle');
    setMessage(error instanceof Error ? error.message : 'No se pudo completar el acceso con Google.');
    retry.current?.focus();
    // A rejected Google credential can coexist with a valid local session.
    if (purpose === 'link' && error instanceof HttpError && error.status === 401) await auth.refresh();
  }
  async function complete(credential: string, controller: AbortController) {
    try {
      if (purpose === 'login') await auth.loginGoogle(credential, controller.signal);
      else {
        const result = await linkGoogle(credential, controller.signal);
        if (!controller.signal.aborted && result.linked) {
          setStage('linked'); setMessage('Cuenta Google vinculada. Puedes usarla en tu próximo inicio de sesión.');
          onLinked?.();
        }
      }
      if (!controller.signal.aborted) { clearTimeout(expiry.current); busyCallback.current?.(false); }
    } catch (error) { await failure(error, controller); }
  }
  return <section className="google-access" data-purpose={purpose} aria-label={purpose === 'login' ? 'Acceso con Google' : 'Vincular Google'} aria-busy={stage === 'loading' || stage === 'verifying'}>
    {purpose === 'login' && <div className="google-access__separator" aria-hidden="true">o</div>}
    {stage === 'idle' && <button ref={retry} type="button" className="cenit-button" disabled={disabled} onClick={() => { void prepare(); }}>Reintentar Google</button>}
    <div ref={button} className="google-access__button" inert={disabled || stage !== 'choosing'} />
    {(stage === 'loading' || stage === 'verifying') && <p role="status">{stage === 'loading' ? 'Preparando Google…' : 'Verificando con Cenit…'}</p>}
    {stage === 'loading' && <button type="button" className="cenit-button" onClick={() => { cancel(); setStage('idle'); setMessage('Intento cancelado. Puedes volver a intentarlo.'); }}>Cancelar intento</button>}
    {message && <p role={stage === 'linked' ? 'status' : 'alert'}>{message}</p>}
  </section>;
}
