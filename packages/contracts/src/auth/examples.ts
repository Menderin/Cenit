import type { LoginRequest, SessionResponse } from './index.js';
// Request credentials must come from private demo preparation, never a committed example password.
export const sessionExample: SessionResponse = { data: {
  account: { id: '123e4567-e89b-42d3-a456-426614174001', email: 'docente@cenit.invalid', name: 'Docente Demo', role: 'docente' },
  expiresAt: '2026-10-12T00:00:00.000Z',
} };
export const loginFieldNames: readonly (keyof LoginRequest)[] = ['email', 'password'];
export const authErrorExamples = [
  { status: 400, code: 'VALIDATION_ERROR', message: 'Revisa los datos de la solicitud.' },
  { status: 401, code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' },
  { status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.' },
  { status: 403, code: 'FORBIDDEN', message: 'Origen no autorizado.' },
  { status: 403, code: 'GOOGLE_NOT_AUTHORIZED', message: 'La cuenta no está autorizada para vincular una identidad Google.' },
  { status: 409, code: 'GOOGLE_LINK_CONFLICT', message: 'La identidad Google o la cuenta ya tiene otra vinculación.' },
  { status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiados intentos. Inténtalo más tarde.' },
  { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible.' },
  { status: 500, code: 'INTERNAL_ERROR', message: 'No fue posible completar la solicitud.' },
].map(({ status, code, message }) => ({ status, body: { error: { code, message, requestId: 'demo-request' } } }));
