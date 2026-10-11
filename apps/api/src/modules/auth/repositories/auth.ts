import type pg from 'pg';
import type { Account } from '@cenit/contracts/auth';

export type AuthAccount = Account & { active: boolean; passwordHash: string };
export class AuthRepository {
  constructor(private readonly pool: pg.Pool) {}
  async account(email: string): Promise<AuthAccount | null> {
    return (await this.pool.query<AuthAccount>('SELECT id,email,name,role,active,password_hash AS "passwordHash" FROM cenit.accounts WHERE email=$1', [email])).rows[0] ?? null;
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
