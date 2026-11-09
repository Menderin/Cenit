import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ErrorResponseSchema } from '../common/index.js';
import { GoogleLinkRequestSchema, GoogleLinkResponseSchema, LoginRequestSchema, SessionResponseSchema, LogoutRequestSchema } from './index.js';
import { authErrorExamples, sessionExample } from './examples.js';

describe('contratos de autenticación', () => {
  it('acepta credenciales, sesión pública y logout', () => {
    expect(Value.Check(LoginRequestSchema, { email: 'docente@cenit.invalid', password: randomBytes(24).toString('hex') })).toBe(true);
    expect(Value.Check(SessionResponseSchema, sessionExample)).toBe(true);
    expect(Value.Check(LogoutRequestSchema, {})).toBe(true);
    expect(Value.Check(GoogleLinkRequestSchema, { sub: 'google-sub-123456' })).toBe(true);
    expect(Value.Check(GoogleLinkResponseSchema, { data: { authorized: true, linked: true } })).toBe(true);
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
    expect(Value.Check(GoogleLinkRequestSchema, { sub: '' })).toBe(false);
    expect(Value.Check(GoogleLinkRequestSchema, { sub: 'con espacios' })).toBe(false);
    expect(Value.Check(GoogleLinkRequestSchema, { sub: 'x'.repeat(256) })).toBe(false);
    expect(Value.Check(GoogleLinkRequestSchema, { sub: 'google-sub-1', email: 'docente@cenit.invalid' })).toBe(false);
    expect(Value.Check(GoogleLinkResponseSchema, { data: { authorized: true, linked: true, sub: 'google-sub-1' } })).toBe(false);
  });
});
