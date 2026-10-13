import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ErrorResponseSchema } from '../common/index.js';
import { LoginRequestSchema, SessionResponseSchema, LogoutRequestSchema } from './index.js';
import { authErrorExamples, sessionExample } from './examples.js';

describe('contratos de autenticación', () => {
  it('acepta credenciales, sesión pública y logout', () => {
    expect(Value.Check(LoginRequestSchema, { email: 'docente@cenit.invalid', password: randomBytes(24).toString('hex') })).toBe(true);
    expect(Value.Check(SessionResponseSchema, sessionExample)).toBe(true);
    expect(Value.Check(LogoutRequestSchema, {})).toBe(true);
    for (const example of authErrorExamples) expect(Value.Check(ErrorResponseSchema, example.body)).toBe(true);
  });
  it.each([
    { email: 'invalido', password: randomBytes(8).toString('hex') },
    { email: 'docente@cenit.invalid', password: '' },
    { email: 'docente@cenit.invalid', password: 'x'.repeat(129) },
    { email: 'docente@cenit.invalid', password: 123 },
    { email: 'docente@cenit.invalid', password: randomBytes(8).toString('hex'), role: 'docente' },
  ])('rechaza solicitud inválida %#', value => expect(Value.Check(LoginRequestSchema, value)).toBe(false));
  it('rechaza secretos y roles ajenos en respuestas', () => {
    expect(Value.Check(SessionResponseSchema, { data: { ...sessionExample.data, token: randomBytes(32).toString('hex') } })).toBe(false);
    expect(Value.Check(SessionResponseSchema, { data: { ...sessionExample.data, account: { ...sessionExample.data.account, role: 'superadmin' } } })).toBe(false);
    expect(Value.Check(LogoutRequestSchema, { role: 'docente' })).toBe(false);
  });
});
