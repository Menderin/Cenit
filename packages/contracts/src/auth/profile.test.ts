import { expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ProfileResponseSchema } from './index.js';

const profile = { data: { account: { id: '00000000-0000-4000-8000-000000000001', email: 'demo@cenit.invalid', name: 'Cuenta ficticia', role: 'docente' },
  google: { enabled: true, linked: true, email: 'google@cenit.invalid', pictureUrl: 'https://lh3.googleusercontent.com/a/fictitious' } } };
it('valida el perfil público, foto opcional y propiedades conocidas', () => {
  expect(Value.Check(ProfileResponseSchema, profile)).toBe(true);
  expect(Value.Check(ProfileResponseSchema, { data: { ...profile.data, google: { enabled: false, linked: false, email: null, pictureUrl: null } } })).toBe(true);
  expect(Value.Check(ProfileResponseSchema, { data: { ...profile.data, token: 'private' } })).toBe(false);
  for (const pictureUrl of ['http://lh3.googleusercontent.com/a', 'https://example.invalid/a', 'https://lh3.googleusercontent.com.evil.invalid/a', 'data:image/png;base64,abc']) {
    expect(Value.Check(ProfileResponseSchema, { data: { ...profile.data, google: { ...profile.data.google, pictureUrl } } })).toBe(false);
  }
});
