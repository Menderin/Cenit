import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type pg from 'pg';
import { AccountEmailSchema, AccountSchema } from '@cenit/contracts/auth';
import { createPool } from '../../apps/api/src/infrastructure/database/connection.js';

const AuthorizationsSchema = Type.Array(Type.Object({ accountId: AccountSchema.properties.id, googleEmail: AccountEmailSchema }, { additionalProperties: false }), { minItems: 1, maxItems: 1000 });
// File safeguards adapted from Ignacio's SCRUM-124 implementation (15a1e36).
export function readGoogleAuthorizationsFile(file: string): unknown {
  const target = resolve(file);
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Usa un archivo privado regular.');
  if (stat.size > 256 * 1024) throw new Error('Archivo de autorizaciones demasiado grande.');
  const input: unknown = JSON.parse(readFileSync(target, 'utf8'));
  if (!Value.Check(AuthorizationsSchema, input)) throw new Error('Archivo de autorizaciones inválido.');
  return input;
}
export async function configureGoogleAuthorizations(pool: pg.Pool, input: unknown, action: 'authorize' | 'revoke'): Promise<number> {
  if (action !== 'authorize' && action !== 'revoke') throw new Error('Acción de autorización inválida.');
  if (!Value.Check(AuthorizationsSchema, input)) throw new Error('Archivo de autorizaciones inválido.');
  const entries = input.map(entry => ({ ...entry, googleEmail: entry.googleEmail.toLowerCase() })).sort((a, b) => a.accountId.localeCompare(b.accountId));
  if (new Set(entries.map(entry => entry.accountId)).size !== entries.length || new Set(entries.map(entry => entry.googleEmail)).size !== entries.length) throw new Error('Autorizaciones duplicadas.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const entry of entries) {
      const account = (await db.query<{ active: boolean }>('SELECT active FROM cenit.accounts WHERE id=$1 FOR UPDATE', [entry.accountId])).rows[0];
      if (!account || (action === 'authorize' && !account.active)) throw new Error('Cuenta inexistente o no disponible.');
      const existing = (await db.query<{ email: string }>('SELECT email FROM cenit.google_authorizations WHERE account_id=$1 FOR UPDATE', [entry.accountId])).rows[0];
      if (existing && existing.email !== entry.googleEmail) throw new Error('La autorización existente es distinta. Requiere revisión explícita.');
      if (action === 'authorize') await db.query('INSERT INTO cenit.google_authorizations(account_id,email) VALUES($1,$2) ON CONFLICT(account_id) DO NOTHING', [entry.accountId, entry.googleEmail]);
      else {
        await db.query('DELETE FROM cenit.google_authorizations WHERE account_id=$1 AND email=$2', [entry.accountId, entry.googleEmail]);
        await db.query("UPDATE cenit.sessions SET revoked_at=greatest(now(),created_at) WHERE account_id=$1 AND authentication_method='google' AND revoked_at IS NULL", [entry.accountId]);
      }
    }
    await db.query('COMMIT'); return entries.length;
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool: pg.Pool | undefined;
  try {
    const [action, file, ...rest] = process.argv.slice(2);
    if (!['authorize', 'revoke'].includes(action ?? '') || !file || rest.length) throw new Error('Uso inválido.');
    const input = readGoogleAuthorizationsFile(file);
    pool = createPool();
    const count = await configureGoogleAuthorizations(pool, input, action as 'authorize' | 'revoke');
    console.log(`Configuración Google aplicada: ${count} cuentas. No se modificaron contraseñas ni roles.`);
  } catch { console.error('No se pudo configurar Google. Revisa el archivo privado, permisos y migraciones.'); process.exitCode = 1; }
  finally { await pool?.end(); }
}
