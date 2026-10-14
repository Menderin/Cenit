import { useRef, useState, type FormEvent } from 'react';
import { Value } from '@sinclair/typebox/value';
import { AccountEmailSchema } from '@cenit/contracts/auth';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { useAuth } from '../model/session.js';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';

type Errors = { email?: string; password?: string };

export function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function normalizeEmail(input: HTMLInputElement) {
    const normalized = input.value.replace(/\s/g, '').toLowerCase();
    // The native email editor can retain visible spaces even when React's value is unchanged.
    input.value = normalized;
    setEmail(normalized);
    return normalized;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
    {auth.message && <StatusNotice kind={auth.notice === 'signed-out' ? 'success' : 'warning'} title={auth.notice === 'signed-out' ? 'Saliste de Cenit' : 'Vuelve a iniciar sesión'} message={auth.message} />}
    {error && <p className="cenit-access__notice cenit-access__error" role="alert">{error}</p>}
    <form className="cenit-access__form" noValidate onSubmit={submit} aria-busy={busy}>
      <div className="cenit-access__field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" ref={emailRef} name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="nombre@ejemplo.cl" value={email} required disabled={busy} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} onBlur={event => normalizeEmail(event.currentTarget)} onChange={event => { setEmail(event.target.value); if (errors.email) setErrors(current => ({ ...current, email: undefined })); }} />
        {errors.email && <p id="email-error" className="cenit-access__error" role="alert">{errors.email}</p>}
      </div>
      <div className="cenit-access__field">
        <label htmlFor="password">Contraseña</label>
        <div className="cenit-access__password">
          <input id="password" ref={passwordRef} name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={128} placeholder="Escribe una contraseña" value={password} required disabled={busy} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} onChange={event => { setPassword(event.target.value); if (errors.password) setErrors(current => ({ ...current, password: undefined })); }} />
          <button className="cenit-access__reveal" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(current => !current)}>
            {showPassword ? <EyeSlashIcon size={18} weight="regular" aria-hidden="true" /> : <EyeIcon size={18} weight="regular" aria-hidden="true" />}
          </button>
        </div>
        {errors.password && <p id="password-error" className="cenit-access__error" role="alert">{errors.password}</p>}
      </div>
      <button className="cenit-access__primary" type="submit" disabled={busy}>
        {busy ? <><span className="cenit-access__spinner" aria-hidden="true" />Entrando…</> : 'Iniciar sesión'}
      </button>
      {busy && <span className="cenit-access__sr-only" role="status">Cargando…</span>}
    </form>
  </>;
}
