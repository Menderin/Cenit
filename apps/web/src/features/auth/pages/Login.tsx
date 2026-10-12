import { useState, type FormEvent } from 'react';
import { useAuth } from '../model/session.js';

export function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await auth.login({ email, password }); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); }
    finally { setPassword(''); setBusy(false); }
  }
  return <section className="space-y-5">
    <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
    {auth.message && <p role="status">{auth.message}</p>}
    {error && <p role="alert">{error}</p>}
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="email">Correo</label><input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></div>
      <div><label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></div>
      <button disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
    </form>
  </section>;
}
