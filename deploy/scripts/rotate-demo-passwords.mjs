// Explicit, supervised demo maintenance. Never invoked by startup, migrations or CD.
import { readFileSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../../apps/api/dist/modules/auth/services/password.js';

async function main() {
  if (process.env.APP_ENV !== 'demo' || !process.env.DATABASE_URL_FILE) throw new Error('demo-only');
  const currentFile = '/app/.local/secrets/auth-demo.json';
  const requestedFile = '/app/.local/secrets/requested-passwords.json';
  for (const file of [currentFile, requestedFile]) {
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error('private-file');
  }
  const current = JSON.parse(readFileSync(currentFile, 'utf8'));
  const requested = JSON.parse(readFileSync(requestedFile, 'utf8'));
  const roles = ['administrativo', 'docente', 'estudiante'];
  for (const values of [current, requested]) {
    if (!Array.isArray(values) || values.length !== 3) throw new Error('three-accounts');
    for (const role of roles) {
      const entries = values.filter(account => account.role === role);
      if (entries.length !== 1 || entries[0].email !== `${role}@cenit.invalid` ||
          typeof entries[0].password !== 'string' || entries[0].password.length < 12 || entries[0].password.length > 128) throw new Error('invalid-account');
    }
  }
  const next = current.map(account => ({ ...account, password: requested.find(value => value.role === account.role).password }));
  const hashes = [];
  for (const account of next) hashes.push(await hashPassword(account.password));
  const connectionString = readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim();
  if (new URL(connectionString).pathname !== '/cenit_demo') throw new Error('demo-database-only');
  const pool = new pg.Pool({ connectionString, max: 1 });
  const stagedFile = `${currentFile}.next`;
  try {
    // Stage before modifying PostgreSQL; refuse an unfinished previous operation.
    writeFileSync(stagedFile, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(1128615497, 2)');
      for (const account of current) {
        const result = await client.query('SELECT id,name,role,active,password_hash FROM cenit.accounts WHERE email=$1 FOR UPDATE', [account.email]);
        const row = result.rows[0];
        if (result.rows.length !== 1 || row.id !== account.id || row.name !== account.name || row.role !== account.role || !row.active ||
            !await verifyPassword(account.password, row.password_hash)) throw new Error('incompatible-account');
      }
      for (const [index, account] of current.entries()) {
        await client.query('UPDATE cenit.accounts SET password_hash=$1,updated_at=clock_timestamp() WHERE id=$2', [hashes[index], account.id]);
        await client.query('UPDATE cenit.sessions SET revoked_at=greatest(clock_timestamp(),created_at) WHERE account_id=$1 AND revoked_at IS NULL', [account.id]);
      }
      await client.query('COMMIT');
      renameSync(stagedFile, currentFile);
    } catch (error) {
      await client.query('ROLLBACK');
      // Preserve the staged private file for diagnosis if commit outcome is uncertain.
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
  console.log('Tres claves de demo actualizadas; identidades conservadas y sesiones anteriores revocadas.');
}
main().catch(() => {
  console.error('No se pudo confirmar el cambio. Revisa el estado antes de reintentar; no compartas los archivos privados.');
  process.exitCode = 1;
});
