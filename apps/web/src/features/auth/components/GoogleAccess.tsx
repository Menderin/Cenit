import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GooglePurpose } from '@cenit/contracts/auth';
import { createGoogleChallenge, getGoogleAvailability, getGoogleLink, linkGoogle } from '../api/google.js';
import { loadGoogleClient, type GoogleClient } from '../model/google-client.js';
import { useAuth } from '../model/session.js';
import { HttpError } from '../../../shared/lib/http.js';
import './google.css';

export function useGoogleAvailability() {
  return useQuery({ queryKey: ['auth', 'google'], queryFn: ({ signal }) => getGoogleAvailability(signal), retry: false, staleTime: Infinity });
}

export function GoogleAccess({ clientId, purpose, disabled = false, onBusy }: {
  clientId: string; purpose: GooglePurpose; disabled?: boolean; onBusy?: (busy: boolean) => void;
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
    setMessage(''); setStage('loading'); busyCallback.current?.(true);
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
      sdk.renderButton(button.current!, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'es', width: Math.min(320, button.current!.clientWidth) });
      setStage('choosing');
      expiry.current = window.setTimeout(() => {
        cancel(); setStage('idle'); setMessage('El intento venció. Prepara un nuevo acceso con Google.'); retry.current?.focus();
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
        }
      }
      if (!controller.signal.aborted) { clearTimeout(expiry.current); busyCallback.current?.(false); }
    } catch (error) { await failure(error, controller); }
  }
  return <section className="google-access" aria-label={purpose === 'login' ? 'Acceso con Google' : 'Vincular Google'} aria-busy={stage === 'loading' || stage === 'verifying'}>
    {stage === 'idle' && <button ref={retry} type="button" className="cenit-button" disabled={disabled} onClick={() => { void prepare(); }}>Preparar {purpose === 'login' ? 'acceso con Google' : 'vinculación con Google'}</button>}
    <div ref={button} className="google-access__button" inert={disabled || stage !== 'choosing'} />
    {(stage === 'loading' || stage === 'verifying') && <p role="status">{stage === 'loading' ? 'Preparando Google…' : 'Verificando con Cenit…'}</p>}
    {stage === 'choosing' && <p>Selecciona tu cuenta en el botón de Google. Si cerraste la ventana, puedes volver a pulsarlo.</p>}
    {(stage === 'choosing' || stage === 'loading') && <button type="button" className="cenit-button" onClick={() => { cancel(); setStage('idle'); setMessage('Intento cancelado. Puedes volver a intentarlo.'); }}>Cancelar intento</button>}
    {message && <p role={stage === 'linked' ? 'status' : 'alert'}>{message}</p>}
  </section>;
}

export function GoogleAccount() {
  const availability = useGoogleAvailability();
  const auth = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const origin = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const status = useQuery({ queryKey: ['auth', auth.session!.account.id, 'google-link'], queryFn: ({ signal }) => getGoogleLink(signal), enabled: open, retry: false, staleTime: 0 });
  function close() { dialog.current?.close(); setOpen(false); origin.current?.focus(); }
  if (!availability.data?.enabled) return null;
  return <>
    <button ref={origin} type="button" className="workspace-nav-item" onClick={() => { setOpen(true); dialog.current?.showModal(); }}>Acceso con Google</button>
    <dialog ref={dialog} className="google-account" aria-labelledby="google-account-title" onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id="google-account-title">Acceso con Google</h2>
      {open && <>
        {status.isPending && <p role="status">Consultando vinculación…</p>}
        {status.isError && <><p role="alert">{status.error.message}</p><button className="cenit-button" onClick={() => { void status.refetch(); }}>Reintentar</button></>}
        {status.data?.linked && <p>Tu cuenta ya tiene una identidad Google vinculada.</p>}
        {status.data && !status.data.linked && <><p>Vincula una cuenta Google autorizada después de entrar con tu correo y contraseña de Cenit.</p><GoogleAccess clientId={availability.data.clientId} purpose="link" /></>}
      </>}
      <button type="button" className="cenit-button" onClick={close}>Cerrar</button>
    </dialog>
  </>;
}
