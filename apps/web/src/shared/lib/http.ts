import { Value } from '@sinclair/typebox/value';
import { ErrorResponseSchema } from '@cenit/contracts';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) { super(message); }
}
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, credentials: 'same-origin', cache: 'no-store' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new HttpError(0, 'No se pudo conectar con el servidor. Intenta nuevamente.');
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = Value.Check(ErrorResponseSchema, body) ? body.error.message : 'No se pudo completar la solicitud.';
    if (response.status === 401 && !['/auth/login', '/auth/session'].includes(path)) window.dispatchEvent(new Event('cenit:unauthenticated'));
    throw new HttpError(response.status, message, body);
  }
  return response;
}
