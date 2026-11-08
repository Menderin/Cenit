import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { CertificateFormat } from 'google-auth-library/build/src/auth/oauth2client.js';
import { describe, expect, it, vi } from 'vitest';
import { googleHash, googleTokenVerifier, readGoogleConfig } from './google.js';

const clientId = '123-demo.apps.googleusercontent.com';
const nonce = 'a'.repeat(64);
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
function token(changes: Record<string, unknown> = {}, privateKey = pair.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: clientId, sub: '123456789',
    email: 'Docente@cenit.invalid', email_verified: true, iat: now, exp: now + 3600, nonce, ...changes })).toString('base64url');
  return `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url')}`;
}
function verifier() {
  const client = new OAuth2Client();
  // Fake Google certificate retrieval only; the installed library checks real RSA signatures.
  vi.spyOn(client, 'getFederatedSignonCertsAsync').mockResolvedValue({ certs: { 'test-key': publicKey }, format: CertificateFormat.PEM });
  return { client, verify: googleTokenVerifier(clientId, client) };
}
it('proveedor apagado si falta configuración válida; no infiere dominios', () => {
  for (const env of [{}, { AUTH_GOOGLE_ENABLED: 'true' }, { AUTH_GOOGLE_ENABLED: 'true', AUTH_GOOGLE_CLIENT_ID: '*' }, { AUTH_GOOGLE_ENABLED: 'false', AUTH_GOOGLE_CLIENT_ID: clientId }]) expect(readGoogleConfig(env)).toEqual({ enabled: false });
  expect(readGoogleConfig({ AUTH_GOOGLE_ENABLED: 'true', AUTH_GOOGLE_CLIENT_ID: clientId })).toEqual({ enabled: true, clientId });
});
it('verifica firma RSA con google-auth-library, nonce y correo verificado', async () => {
  const { verify } = verifier();
  expect(await verify(token(), googleHash(nonce))).toEqual({ sub: '123456789', email: 'docente@cenit.invalid' });
});
describe('rechaza claims incoherentes sin exponer el token', () => {
  it.each([
    { aud: 'otro.apps.googleusercontent.com' }, { iss: 'https://example.invalid' }, { sub: '' }, { sub: undefined }, { sub: 123 },
    { email_verified: false }, { email_verified: 'true' }, { email: 'invalid' }, { nonce: 'b'.repeat(64) }, { nonce: null },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { iat: Math.floor(Date.now() / 1000) + 120 },
  ])('%j', async changes => {
    const { verify } = verifier();
    await expect(verify(token(changes), googleHash(nonce))).rejects.toMatchObject({ status: 401, code: 'GOOGLE_CREDENTIAL_INVALID' });
  });
});
it('rechaza firma falsificada y formatos que no son JWT', async () => {
  const { verify } = verifier();
  await expect(verify(token({}, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), googleHash(nonce))).rejects.toMatchObject({ status: 401 });
  await expect(verify('invalid', googleHash(nonce))).rejects.toMatchObject({ status: 401 });
});
it('fallo de red de Google produce 503 sin detalles internos', async () => {
  const { client, verify } = verifier();
  vi.mocked(client.getFederatedSignonCertsAsync).mockRejectedValue(Object.assign(new Error('private details'), { code: 'ETIMEDOUT' }));
  await expect(verify(token(), googleHash(nonce))).rejects.toMatchObject({ status: 503, code: 'GOOGLE_UNAVAILABLE' });
});
