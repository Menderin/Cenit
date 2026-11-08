import type pg from 'pg';
import type { Account } from '@cenit/contracts/auth';
import type { GoogleIdentity } from '../services/google.js';

export type AuthAccount = Account & { active: boolean; passwordHash: string };
export class AuthRepository {
  constructor(private readonly pool: pg.Pool) {}
  async account(email: string): Promise<AuthAccount | null> {
    return (await this.pool.query<AuthAccount>('SELECT id,email,name,role,active,password_hash AS "passwordHash" FROM cenit.accounts WHERE email=$1', [email])).rows[0] ?? null;
  }
  async googleAccount(identity: GoogleIdentity): Promise<AuthAccount | null> {
    return (await this.pool.query<AuthAccount>(`SELECT a.id,a.email,a.name,a.role,a.active,a.password_hash AS "passwordHash"
      FROM cenit.google_identities g JOIN cenit.accounts a ON a.id=g.account_id
      JOIN cenit.google_authorizations w ON w.account_id=a.id AND w.email=$2 WHERE g.subject=$1`, [identity.sub, identity.email])).rows[0] ?? null;
  }
  async isLocalSession(hash: string, now: Date): Promise<boolean> {
    return (await this.pool.query(`SELECT 1 FROM cenit.sessions s JOIN cenit.accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.authentication_method='local' AND s.revoked_at IS NULL AND s.created_at<=$2 AND s.expires_at>$2 AND a.active`, [hash, now])).rowCount === 1;
  }
  async createSession(accountId: string, tokenHash: string, previousHash: string | null, createdAt: Date, expiresAt: Date, google?: GoogleIdentity): Promise<boolean> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Lock against deactivation/credential changes while establishing the session.
      const account = (await db.query<{ active: boolean }>('SELECT active FROM cenit.accounts WHERE id=$1 FOR SHARE', [accountId])).rows[0];
      if (!account?.active) { await db.query('ROLLBACK'); return false; }
      if (google && !(await db.query(`SELECT 1 FROM cenit.google_identities g JOIN cenit.google_authorizations w ON w.account_id=g.account_id
        WHERE g.account_id=$1 AND g.subject=$2 AND w.email=$3 FOR SHARE OF g,w`, [accountId, google.sub, google.email])).rowCount) {
        await db.query('ROLLBACK'); return false;
      }
      if (previousHash) await db.query('UPDATE cenit.sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL', [previousHash, createdAt]);
      // Local SQL remains compatible with the previous schema and image.
      if (google) await db.query("INSERT INTO cenit.sessions(token_hash,account_id,created_at,expires_at,authentication_method) VALUES($1,$2,$3,$4,'google')", [tokenHash, accountId, createdAt, expiresAt]);
      else await db.query('INSERT INTO cenit.sessions(token_hash,account_id,created_at,expires_at) VALUES($1,$2,$3,$4)', [tokenHash, accountId, createdAt, expiresAt]);
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
