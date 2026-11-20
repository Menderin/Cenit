import { useRef, useState, type FormEvent } from 'react';
import { Value } from '@sinclair/typebox/value';
import { AccountEmailSchema } from '@cenit/contracts/auth';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { useAuth } from '../model/session.js';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';
import { GoogleAccess, GoogleLoginLayout, useGoogleAvailability } from '../components/GoogleAccess.js';

type Errors = { email?: string; password?: string };

export function Login({ checking }: { checking: boolean }) {
  const auth = useAuth();
  const google = useGoogleAvailability(!checking);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const locked = checking || busy;
  const googleUnavailable = google.isError || google.data?.enabled === false;

  function normalizeEmail(input: HTMLInputElement) {
    const normalized = input.value.replace(/\s/g, '').toLowerCase();
    // The native email editor can retain visible spaces even when React's value is unchanged.
    input.value = normalized;
    setEmail(normalized);
    return normalized;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || googleBusy) return;
    const normalizedEmail = normalizeEmail(emailRef.current!);
    const nextErrors: Errors = {};
    if (!normalizedEmail) nextErrors.email = 'Escribe tu correo electrónico.';
    else if (!Value.Check(AccountEmailSchema, normalizedEmail) || emailRef.current?.validity.typeMismatch) nextErrors.email = 'Revisa el formato del correo electrónico.';
    if (!password) nextErrors.password = 'Escribe tu contraseña.';
    setErrors(nextErrors);
    setError('');
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    try { await auth.login({ email: normalizedEmail, password }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo iniciar sesión.'); }
    finally { setPassword(''); setBusy(false); }
  }

  return <>
    <header className="cenit-access__heading">
      <h1 id="access-title">Iniciar sesión</h1>
      <p className="cenit-access__intro">Bienvenido a tu espacio en Cenit.</p>
    </header>
    <div className="cenit-access__feedback">
      {error ? <p className="cenit-access__error" role="alert">{error}</p>
        : auth.message && auth.notice !== 'expired' && <StatusNotice kind="warning" title="Vuelve a iniciar sesión" message={auth.message} />}
    </div>
    <form className="cenit-access__form" noValidate onSubmit={submit} aria-busy={locked} inert={googleBusy}>
      <div className="cenit-access__field">
        <label htmlFor="email">Correo electrónico</label>
        <input className="cenit-input" id="email" ref={emailRef} name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="nombre@ejemplo.cl" value={email} required disabled={locked} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} onBlur={event => normalizeEmail(event.currentTarget)} onChange={event => { setEmail(event.target.value); if (errors.email) setErrors(current => ({ ...current, email: undefined })); }} />
        <div className="cenit-access__field-feedback">{errors.email && <p id="email-error" className="cenit-access__error" role="alert">{errors.email}</p>}</div>
      </div>
      <div className="cenit-access__field">
        <label htmlFor="password">Contraseña</label>
        <div className="cenit-access__password">
          <input className="cenit-input" id="password" ref={passwordRef} name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={128} placeholder="Escribe una contraseña" value={password} required disabled={locked} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} onChange={event => { setPassword(event.target.value); if (errors.password) setErrors(current => ({ ...current, password: undefined })); }} />
          <button className="cenit-access__reveal" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} disabled={locked} onClick={() => setShowPassword(current => !current)}>
            <span className="cenit-access__eye" data-visible={!showPassword}><EyeIcon size={18} weight="regular" aria-hidden="true" /></span><span className="cenit-access__eye" data-visible={showPassword}><EyeSlashIcon size={18} weight="regular" aria-hidden="true" /></span>
          </button>
        </div>
        <div className="cenit-access__field-feedback">{errors.password && <p id="password-error" className="cenit-access__error" role="alert">{errors.password}</p>}</div>
      </div>
      <button className="cenit-button cenit-button--primary cenit-access__primary" type="submit" disabled={locked}>
        {busy ? <><span className="cenit-access__spinner" aria-hidden="true" />Entrando…</> : 'Iniciar sesión'}
      </button>
    </form>
    {locked && <span className="cenit-access__sr-only" role="status">{checking ? 'Comprobando sesión…' : 'Cargando…'}</span>}
    <div className="cenit-access__google-slot">
      {!checking && google.data?.enabled ? <GoogleAccess clientId={google.data.clientId} purpose="login" disabled={busy} onBusy={setGoogleBusy} />
        : <GoogleLoginLayout busy={google.isFetching} controls={
          <button type="button" className="cenit-button google-access__unavailable" disabled aria-describedby={googleUnavailable ? 'google-unavailable' : undefined}>Iniciar sesión con Google</button>
        }>
          {googleUnavailable && <p id="google-unavailable" role="status">{google.data?.enabled === false ? 'El acceso con Google no está habilitado.' : 'Google no está disponible en este momento.'}</p>}
        </GoogleLoginLayout>}
    </div>
  </>;
}
