import type pg from 'pg';
import type { Account, GoogleLinkStatus } from '@cenit/contracts/auth';
import { ApiError } from '../../../infrastructure/errors.js';

export type AuthAccount = Account & { active: boolean; passwordHash: string };
export class AuthRepository {
  constructor(private readonly pool: pg.Pool) {}
  async account(email: string): Promise<AuthAccount | null> {
    return (await this.pool.query<AuthAccount>('SELECT id,email,name,role,active,password_hash AS "passwordHash" FROM cenit.accounts WHERE email=$1', [email])).rows[0] ?? null;
  }
  async accountByGoogleSub(sub: string): Promise<AuthAccount | null> {
    return (await this.pool.query<AuthAccount>(
      `SELECT a.id,a.email,a.name,a.role,a.active,a.password_hash AS "passwordHash"
       FROM cenit.google_identities g JOIN cenit.accounts a ON a.id=g.account_id
       WHERE g.google_sub=$1 AND g.authorized AND a.active`, [sub])).rows[0] ?? null;
  }
  async googleStatus(accountId: string): Promise<GoogleLinkStatus> {
    const row = (await this.pool.query<{ authorized: boolean; linked: boolean }>(
      'SELECT authorized,(google_sub IS NOT NULL) AS linked FROM cenit.google_identities WHERE account_id=$1', [accountId])).rows[0];
    return row ? { authorized: row.authorized, linked: row.linked } : { authorized: false, linked: false };
  }
  async linkGoogle(tokenHash: string, sub: string, now: Date): Promise<GoogleLinkStatus> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const session = (await db.query<{ accountId: string; active: boolean }>(
        `SELECT a.id AS "accountId",a.active FROM cenit.sessions s JOIN cenit.accounts a ON a.id=s.account_id
         WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND s.created_at<=$2 FOR UPDATE OF a`, [tokenHash, now])).rows[0];
      if (!session?.active) {
        await db.query('ROLLBACK');
        throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.');
      }
      const current = (await db.query<{ authorized: boolean; googleSub: string | null }>(
        'SELECT authorized,google_sub AS "googleSub" FROM cenit.google_identities WHERE account_id=$1 FOR UPDATE', [session.accountId])).rows[0];
      if (!current?.authorized) {
        await db.query('ROLLBACK');
        throw new ApiError(403, 'GOOGLE_NOT_AUTHORIZED', 'La cuenta no está autorizada para vincular una identidad Google.');
      }
      if (current.googleSub !== null && current.googleSub !== sub) {
        await db.query('ROLLBACK');
        throw new ApiError(409, 'GOOGLE_LINK_CONFLICT', 'La identidad Google o la cuenta ya tiene otra vinculación.');
      }
      const other = (await db.query<{ accountId: string }>(
        'SELECT account_id AS "accountId" FROM cenit.google_identities WHERE google_sub=$1 AND account_id<>$2', [sub, session.accountId])).rows[0];
      if (other) {
        await db.query('ROLLBACK');
        throw new ApiError(409, 'GOOGLE_LINK_CONFLICT', 'La identidad Google o la cuenta ya tiene otra vinculación.');
      }
      if (current.googleSub === null) {
        await db.query(
          `UPDATE cenit.google_identities
           SET google_sub=$2,linked_at=GREATEST(authorized_at,$3),updated_at=GREATEST(authorized_at,updated_at,$3)
           WHERE account_id=$1 AND authorized AND google_sub IS NULL`, [session.accountId, sub, now]);
      }
      await db.query('COMMIT');
      return { authorized: true, linked: true };
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'GOOGLE_LINK_CONFLICT', 'La identidad Google o la cuenta ya tiene otra vinculación.');
      }
      throw error;
    } finally { db.release(); }
  }
  async createSession(accountId: string, tokenHash: string, previousHash: string | null, createdAt: Date, expiresAt: Date): Promise<boolean> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Lock against deactivation/credential changes while establishing the session.
      const account = (await db.query<{ active: boolean }>('SELECT active FROM cenit.accounts WHERE id=$1 FOR SHARE', [accountId])).rows[0];
      if (!account?.active) { await db.query('ROLLBACK'); return false; }
      if (previousHash) await db.query('UPDATE cenit.sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL', [previousHash, createdAt]);
      await db.query('INSERT INTO cenit.sessions(token_hash,account_id,created_at,expires_at) VALUES($1,$2,$3,$4)', [tokenHash, accountId, createdAt, expiresAt]);
      await db.query('COMMIT'); return true;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async session(tokenHash: string, now: Date): Promise<{ account: Account; expiresAt: Date } | null> {
    const result = await this.pool.query<Account & { expiresAt: Date }>(
      'SELECT a.id,a.email,a.name,a.role,s.expires_at AS "expiresAt" FROM cenit.sessions s JOIN cenit.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND s.created_at<=$2 AND a.active', [tokenHash, now]);
    const row = result.rows[0];
    if (!row) return null;
    const { expiresAt, ...account } = row;
    return { account, expiresAt };
  }
  async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.pool.query('UPDATE cenit.sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL AND created_at<=$2', [tokenHash, now]);
  }
}
