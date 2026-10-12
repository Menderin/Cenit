import { Value } from '@sinclair/typebox/value';
import { SessionResponseSchema, type LoginRequest, type SessionResponse } from '@cenit/contracts/auth';
import { api, HttpError } from '../../../shared/lib/http.js';

async function readSession(response: Response): Promise<SessionResponse['data']> {
  const value: unknown = await response.json().catch(() => null);
  if (!Value.Check(SessionResponseSchema, value)) throw new HttpError(0, 'El servidor devolvió una sesión inválida.');
  return value.data;
}
export const getSession = async (signal?: AbortSignal) => readSession(await api('/auth/session', { signal }));
export const signIn = async (input: LoginRequest) => readSession(await api('/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
}));
export async function signOut() {
  const response = await api('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (response.status !== 204) throw new HttpError(0, 'No se pudo confirmar el cierre de sesión.');
}
