import { Value } from '@sinclair/typebox/value';
import { expect, it } from 'vitest';
import { GoogleAvailabilitySchema, GoogleChallengeRequestSchema, GoogleChallengeResponseSchema, GoogleCredentialRequestSchema } from './index.js';

it('disponibilidad coherente sin filtrar configuración privada', () => {
  expect(Value.Check(GoogleAvailabilitySchema, { data: { enabled: false, clientId: null } })).toBe(true);
  expect(Value.Check(GoogleAvailabilitySchema, { data: { enabled: true, clientId: 'demo.apps.googleusercontent.com' } })).toBe(true);
  for (const data of [{ enabled: true, clientId: null }, { enabled: false, clientId: 'id' }, { enabled: false, clientId: null, secret: 'x' }]) expect(Value.Check(GoogleAvailabilitySchema, { data })).toBe(false);
});
it('entradas estrictas sin rol, email ni vínculo decidido por el navegador', () => {
  expect(Value.Check(GoogleChallengeRequestSchema, { purpose: 'link' })).toBe(true);
  for (const input of [{ purpose: 'register' }, { purpose: 'login', role: 'administrativo' }]) expect(Value.Check(GoogleChallengeRequestSchema, input)).toBe(false);
  expect(Value.Check(GoogleCredentialRequestSchema, { credential: 'jwt' })).toBe(true);
  for (const input of [{ credential: '' }, { credential: 'a'.repeat(16385) }, { credential: 'jwt', email: 'x@cenit.invalid' }]) expect(Value.Check(GoogleCredentialRequestSchema, input)).toBe(false);
  expect(Value.Check(GoogleChallengeResponseSchema, { data: { nonce: 'a'.repeat(64), expiresAt: '2026-11-07T12:05:00.000Z' } })).toBe(true);
});
