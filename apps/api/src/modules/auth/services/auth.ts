import { createHash, randomBytes } from 'node:crypto';
import type { LoginRequest, SessionResponse } from '@cenit/contracts/auth';
import { ApiError } from '../../../infrastructure/errors.js';
import type { AuthRepository } from '../repositories/auth.js';
import { dummyPasswordHash, verifyPassword } from './password.js';

export const SESSION_SECONDS = 2 * 60 * 60;
export function sessionHash(token: string | undefined): string | null {
  return token && /^[0-9a-f]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null;
}
export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly clock: () => Date = () => new Date()) {}
  async login(input: LoginRequest, previousToken?: string): Promise<{ token: string; response: SessionResponse }> {
    const account = await this.repository.account(input.email.trim().toLowerCase());
    const valid = await verifyPassword(input.password, account?.passwordHash ?? dummyPasswordHash);
    if (!account?.active || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    const now = this.clock(), expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000), token = randomBytes(32).toString('hex');
    if (!await this.repository.createSession(account.id, sessionHash(token)!, sessionHash(previousToken), now, expiresAt)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    const { id, email, name, role } = account;
    return { token, response: { data: { account: { id, email, name, role }, expiresAt: expiresAt.toISOString() } } };
  }
  async session(token?: string): Promise<SessionResponse | null> {
    const hash = sessionHash(token);
    if (!hash) return null;
    const result = await this.repository.session(hash, this.clock());
    return result ? { data: { account: result.account, expiresAt: result.expiresAt.toISOString() } } : null;
  }
  async logout(token?: string): Promise<void> {
    const hash = sessionHash(token); if (hash) await this.repository.revoke(hash, this.clock());
  }
}
