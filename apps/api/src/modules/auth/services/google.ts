import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { GooglePurpose } from '@cenit/contracts/auth';
import { ApiError } from '../../../infrastructure/errors.js';
import type { GoogleRepository } from '../repositories/google.js';
import { sessionHash, type AuthService } from './auth.js';

export type GoogleIdentity = { sub: string; email: string; pictureUrl?: string | null };
export function googlePictureUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) return null;
    return url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}
export type GoogleConfig = { enabled: false } | { enabled: true; clientId: string };
export const GOOGLE_CHALLENGE_SECONDS = 300;
export const googleHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function readGoogleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig {
  const clientId = env.AUTH_GOOGLE_CLIENT_ID;
  // An absent or malformed optional provider must not disable local authentication.
  return env.AUTH_GOOGLE_ENABLED === 'true' && clientId && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) && clientId.length <= 255
    ? { enabled: true, clientId } : { enabled: false };
}
export const invalidGoogle = () => new ApiError(401, 'GOOGLE_CREDENTIAL_INVALID', 'No se pudo verificar el acceso con Google. Solicita un nuevo intento.');
export type GoogleTokenVerifier = (credential: string, nonceHash: string) => Promise<GoogleIdentity>;
export function googleTokenVerifier(clientId: string, client = new OAuth2Client(), clock = () => new Date()): GoogleTokenVerifier {
  // Bound certificate retrieval; the library keeps Google's certificate cache.
  client.transporter.defaults = { ...client.transporter.defaults, timeout: 5000, retry: false };
  return async (credential, nonceHash) => {
    let payload;
    try { payload = (await client.verifyIdToken({ idToken: credential, audience: clientId })).getPayload(); }
    catch (error) {
      const candidate = error as { code?: string; response?: { status?: number } };
      if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(candidate.code ?? '') || (candidate.response?.status ?? 0) >= 500) {
        throw new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google no está disponible. Puedes usar el acceso local.');
      }
      throw invalidGoogle();
    }
    const nonce = (payload as { nonce?: unknown } | undefined)?.nonce;
    const now = clock().getTime() / 1000;
    if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || payload.aud !== clientId ||
      !Number.isInteger(payload.exp) || payload.exp <= now || !Number.isInteger(payload.iat) || payload.iat > now + 60 ||
      typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub) || payload.email_verified !== true ||
      typeof payload.email !== 'string' || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      typeof nonce !== 'string' || !/^[0-9a-f]{64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(nonceHash) ||
      !timingSafeEqual(Buffer.from(googleHash(nonce), 'hex'), Buffer.from(nonceHash, 'hex'))) throw invalidGoogle();
    return { sub: payload.sub, email: payload.email.toLowerCase(), pictureUrl: googlePictureUrl(payload.picture) };
  };
}

export class GoogleService {
  constructor(readonly config: GoogleConfig, private readonly repository: GoogleRepository, private readonly auth: AuthService,
    private readonly verify?: GoogleTokenVerifier, private readonly clock = () => new Date()) {}
  availability() { return { data: this.config.enabled ? { enabled: true as const, clientId: this.config.clientId } : { enabled: false as const, clientId: null } }; }
  private enabled() {
    if (!this.config.enabled || !this.verify) throw new ApiError(503, 'GOOGLE_DISABLED', 'El acceso con Google no está habilitado. Usa el acceso local.');
  }
  async challenge(purpose: GooglePurpose, sessionToken?: string, previousChallenge?: string) {
    this.enabled();
    const local = purpose === 'link' ? await this.auth.localSession(sessionToken) : null;
    if (purpose === 'link' && !local) throw new ApiError(401, 'LOCAL_SESSION_REQUIRED', 'Inicia sesión con tu contraseña para vincular Google.');
    const token = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex'), now = this.clock();
    const expiresAt = new Date(now.getTime() + GOOGLE_CHALLENGE_SECONDS * 1000);
    await this.repository.createChallenge({ tokenHash: googleHash(token), nonceHash: googleHash(nonce), purpose,
      accountId: local?.data.account.id ?? null, sessionHash: sessionHash(sessionToken), createdAt: now, expiresAt }, sessionHash(previousChallenge));
    return { token, response: { data: { nonce, expiresAt: expiresAt.toISOString() } } };
  }
  async complete(purpose: GooglePurpose, credential: string, challengeToken?: string, sessionToken?: string) {
    this.enabled();
    if (!challengeToken || !/^[0-9a-f]{64}$/.test(challengeToken)) throw invalidGoogle();
    const challenge = await this.repository.consumeChallenge(googleHash(challengeToken), purpose, this.clock());
    if (!challenge || challenge.sessionHash !== sessionHash(sessionToken)) throw invalidGoogle();
    const identity = await this.verify!(credential, challenge.nonceHash);
    if (purpose === 'login') return this.auth.loginGoogle(identity, sessionToken);
    const local = await this.auth.localSession(sessionToken);
    if (!local || local.data.account.id !== challenge.accountId) throw new ApiError(401, 'LOCAL_SESSION_REQUIRED', 'Inicia sesión con tu contraseña para vincular Google.');
    await this.repository.link(challenge.accountId!, challenge.sessionHash!, identity, this.clock());
    return null;
  }
  async linkStatus(sessionToken?: string) {
    this.enabled();
    const session = await this.auth.session(sessionToken);
    if (!session) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.');
    return { data: { linked: await this.repository.linked(session.data.account.id) } };
  }
  async profile(accountId: string) {
    return { enabled: this.config.enabled, ...await this.repository.profile(accountId) };
  }
}
