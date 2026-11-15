import type pg from 'pg';
import type { GooglePurpose } from '@cenit/contracts/auth';
import { ApiError } from '../../../infrastructure/errors.js';
import type { GoogleIdentity } from '../services/google.js';

export type GoogleChallenge = { tokenHash: string; nonceHash: string; purpose: GooglePurpose; accountId: string | null;
  sessionHash: string | null; createdAt: Date; expiresAt: Date };
export class GoogleRepository {
  constructor(private readonly pool: pg.Pool) {}
  async createChallenge(challenge: GoogleChallenge, previousHash: string | null) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM cenit.google_challenges WHERE expires_at<=$1 OR token_hash=$2', [challenge.createdAt, previousHash]);
      await db.query(`INSERT INTO cenit.google_challenges(token_hash,nonce_hash,purpose,account_id,session_hash,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [challenge.tokenHash, challenge.nonceHash, challenge.purpose, challenge.accountId, challenge.sessionHash, challenge.createdAt, challenge.expiresAt]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async consumeChallenge(hash: string, purpose: GooglePurpose, now: Date): Promise<GoogleChallenge | null> {
    // DELETE is atomic across processes; concurrent submissions cannot reuse a challenge.
    return (await this.pool.query<GoogleChallenge>(`DELETE FROM cenit.google_challenges WHERE token_hash=$1
      RETURNING token_hash AS "tokenHash",nonce_hash AS "nonceHash",purpose,account_id AS "accountId",session_hash AS "sessionHash",created_at AS "createdAt",expires_at AS "expiresAt"`, [hash]))
      .rows.filter(row => row.purpose === purpose && row.createdAt <= now && row.expiresAt > now)[0] ?? null;
  }
  async linked(accountId: string) {
    return (await this.pool.query('SELECT 1 FROM cenit.google_identities WHERE account_id=$1', [accountId])).rowCount === 1;
  }
  async profile(accountId: string) {
    return (await this.pool.query<{ linked: boolean; email: string | null; pictureUrl: string | null }>(
      `SELECT (g.account_id IS NOT NULL) AS linked,w.email,g.picture_url AS "pictureUrl"
       FROM cenit.accounts a LEFT JOIN cenit.google_identities g ON g.account_id=a.id
       LEFT JOIN cenit.google_authorizations w ON w.account_id=a.id WHERE a.id=$1`, [accountId])).rows[0]
      ?? { linked: false, email: null, pictureUrl: null };
  }
  async link(accountId: string, sessionHash: string, identity: GoogleIdentity, now: Date) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const account = (await db.query<{ active: boolean }>('SELECT active FROM cenit.accounts WHERE id=$1 FOR UPDATE', [accountId])).rows[0];
      const session = await db.query(`SELECT 1 FROM cenit.sessions WHERE account_id=$1 AND token_hash=$2 AND authentication_method='local'
        AND revoked_at IS NULL AND created_at<=$3 AND expires_at>$3 FOR SHARE`, [accountId, sessionHash, now]);
      if (!account?.active || !session.rowCount) throw new ApiError(401, 'LOCAL_SESSION_REQUIRED', 'Inicia sesión con tu contraseña para vincular Google.');
      if (!(await db.query('SELECT 1 FROM cenit.google_authorizations WHERE account_id=$1 AND email=$2 FOR SHARE', [accountId, identity.email])).rowCount) {
        throw new ApiError(403, 'GOOGLE_NOT_AUTHORIZED', 'Esta identidad Google no tiene acceso autorizado a Cenit.');
      }
      const existing = (await db.query<{ subject: string; account_id: string }>('SELECT subject,account_id FROM cenit.google_identities WHERE account_id=$1 OR subject=$2', [accountId, identity.sub])).rows;
      if (existing.some(row => row.account_id !== accountId || row.subject !== identity.sub)) throw new ApiError(409, 'GOOGLE_LINK_CONFLICT', 'La identidad o cuenta ya tiene otra vinculación.');
      if (!existing.length) await db.query('INSERT INTO cenit.google_identities(account_id,subject,linked_at,picture_url) VALUES($1,$2,$3,$4)', [accountId, identity.sub, now, identity.pictureUrl ?? null]);
      else await db.query('UPDATE cenit.google_identities SET picture_url=$2 WHERE account_id=$1', [accountId, identity.pictureUrl ?? null]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'GOOGLE_LINK_CONFLICT', 'La identidad o cuenta ya tiene otra vinculación.');
      throw error;
    } finally { db.release(); }
  }
}
