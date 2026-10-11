import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { hashPassword, verifyPassword, dummyPasswordHash } from './password.js';
import { sessionHash } from './auth.js';
import { readAuthConfig } from '../routes/index.js';

it('protege contraseña con salt, verifica y no admite hash inválido', async () => {
  const password = randomBytes(24).toString('base64url');
  const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);
  expect(first).not.toBe(second); expect(first).not.toContain(password);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword(randomBytes(24).toString('hex'), first)).toBe(false);
  expect(await verifyPassword(password, dummyPasswordHash)).toBe(false);
  expect(await verifyPassword(password, 'invalid')).toBe(false);
  await expect(hashPassword('')).rejects.toThrow();
});
it('no acepta tokens arbitrarios ni guarda el token sin hash', () => {
  const token = randomBytes(32).toString('hex');
  expect(sessionHash(token)).toMatch(/^[0-9a-f]{64}$/); expect(sessionHash(token)).not.toBe(token);
  expect(sessionHash('invalid')).toBeNull(); expect(sessionHash(undefined)).toBeNull();
});
it('cookie segura por defecto; HTTP sólo explícito para demo', () => {
  expect(readAuthConfig({}).cookieSecure).toBe(true);
  expect(readAuthConfig({ APP_ENV: 'demo', AUTH_COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  expect(() => readAuthConfig({ APP_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })).toThrow();
  expect(() => readAuthConfig({ AUTH_COOKIE_SECURE: 'off' })).toThrow();
  for (const origin of ['*', 'null', 'https://cenit.example/path', 'http://user@localhost:3000']) {
    expect(() => readAuthConfig({ AUTH_ALLOWED_ORIGINS: origin })).toThrow();
  }
});
