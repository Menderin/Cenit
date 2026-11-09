import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AccountEmailSchema, AccountSchema } from '@cenit/contracts/auth';
import { createPool } from '../../apps/api/src/infrastructure/database/connection.js';

export const GoogleAuthorizationEntrySchema = Type.Object({
  accountId: AccountSchema.properties.id,
  email: Type.Optional(AccountEmailSchema),
}, { additionalProperties: false });
export const GoogleAuthorizationListSchema = Type.Array(GoogleAuthorizationEntrySchema, { minItems: 1, maxItems: 1000 });
export type GoogleAuthorizationEntry = Static<typeof GoogleAuthorizationEntrySchema>;
export type GoogleAuthorizationAction = 'authorize' | 'revoke';

function normalizeEntries(input: unknown): GoogleAuthorizationEntry[] {
  if (!Value.Check(GoogleAuthorizationListSchema, input)) {
    throw new Error('Archivo privado de autorizaciones Google inválido.');
  }
  const entries = input
    .map(entry => ({ accountId: entry.accountId, ...(entry.email ? { email: entry.email.trim().toLowerCase() } : {}) }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  const ids = new Set(entries.map(entry => entry.accountId));
  const emails = entries.filter(entry => entry.email).map(entry => entry.email!);
  if (ids.size !== entries.length || new Set(emails).size !== emails.length) {
    throw new Error('El archivo privado contiene cuentas o correos duplicados.');
  }
  return entries;
}
export function readGoogleAuthorizationsFile(file: string): GoogleAuthorizationEntry[] {
  const target = resolve(file);
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('No usar enlaces simbólicos para autorizaciones privadas.');
  if (stat.size > 256 * 1024) throw new Error('Archivo de autorizaciones demasiado grande.');
  return normalizeEntries(JSON.parse(readFileSync(target, 'utf8')));
}
export async function configureGoogleAuthorizations(
  pool: pg.Pool,
  input: unknown,
  action: GoogleAuthorizationAction = 'authorize',
  now: Date = new Date(),
): Promise<number> {
  if (!['authorize', 'revoke'].includes(action)) throw new Error('Acción de autorización Google inválida.');
  const entries = normalizeEntries(input);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(1128615497, 3)');
    for (const entry of entries) {
      const account = (await db.query<{ id: string; email: string; active: boolean }>(
        'SELECT id,email,active FROM cenit.accounts WHERE id=$1 FOR UPDATE', [entry.accountId])).rows[0];
      if (!account || (entry.email && account.email !== entry.email) || (action === 'authorize' && !account.active)) {
        throw new Error('Cuenta inexistente, inactiva o no coincide con el archivo privado.');
      }
      if (action === 'authorize') {
        await db.query(
          `INSERT INTO cenit.google_identities(account_id,authorized,authorized_at,updated_at)
           VALUES($1,true,$2,$2)
           ON CONFLICT(account_id) DO UPDATE
           SET authorized=true,updated_at=GREATEST(cenit.google_identities.authorized_at,cenit.google_identities.updated_at,$2)`,
          [entry.accountId, now],
        );
      } else {
        await db.query(
          `UPDATE cenit.google_identities
           SET authorized=false,updated_at=GREATEST(authorized_at,updated_at,$2)
           WHERE account_id=$1`,
          [entry.accountId, now],
        );
      }
    }
    await db.query('COMMIT');
    return entries.length;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
async function main() {
  const [action, file, ...rest] = process.argv.slice(2);
  if ((action !== 'authorize' && action !== 'revoke') || !file || rest.length > 0) {
    throw new Error('Usa: auth:google-authorizations -- <authorize|revoke> <archivo-privado.json>');
  }
  const entries = readGoogleAuthorizationsFile(file);
  const pool = createPool();
  try {
    const total = await configureGoogleAuthorizations(pool, entries, action);
    console.log(`Autorizaciones Google aplicadas (${action}): ${total} cuentas. No se modificaron contraseñas, roles ni sesiones.`);
  } finally {
    await pool.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Actualización de autorizaciones Google fallida. Revisa el archivo privado, migraciones y estado de las cuentas.');
    process.exitCode = 1;
  });
}
