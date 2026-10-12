import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AccountEmailSchema, AccountRoleSchema, type AccountRole } from '../../packages/contracts/src/auth/index.js';
import { createPool } from '../../apps/api/src/infrastructure/database/connection.js';
import { hashPassword, verifyPassword } from '../../apps/api/src/modules/auth/services/password.js';

const DemoCredentialsSchema = Type.Array(Type.Object({
  id: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
  email: AccountEmailSchema, name: Type.String({ minLength: 1, maxLength: 200 }), role: AccountRoleSchema,
  password: Type.String({ minLength: 12, maxLength: 128 }),
}, { additionalProperties: false }), { minItems: 3, maxItems: 3 });
export type DemoCredentials = Static<typeof DemoCredentialsSchema>;
export type DemoPasswords = Record<AccountRole, string>;
export const demoPasswordKeys = { docente: 'CENIT_DEMO_DOCENTE_PASSWORD', estudiante: 'CENIT_DEMO_ESTUDIANTE_PASSWORD', administrativo: 'CENIT_DEMO_ADMINISTRATIVO_PASSWORD' } as const;
export function demoPasswordsFromEnv(env: NodeJS.ProcessEnv): DemoPasswords | undefined {
  if (!Object.values(demoPasswordKeys).some(key => Boolean(env[key]))) return undefined;
  const passwords = Object.fromEntries(Object.entries(demoPasswordKeys).map(([role, key]) => [role, env[key]])) as DemoPasswords;
  if (Object.values(passwords).some(password => typeof password !== 'string' || password.length < 12 || password.length > 128)) throw new Error('Configura las tres claves de demo (12–128 caracteres) fuera de Git.');
  return passwords;
}
export function createDemoCredentials(passwords?: DemoPasswords): DemoCredentials {
  const credentials = (['docente', 'estudiante', 'administrativo'] as const).map(role => ({
    id: randomUUID(), email: `${role}@cenit.invalid`, name: `${role[0]!.toUpperCase()}${role.slice(1)} Demo`, role,
    password: passwords?.[role] ?? randomBytes(24).toString('base64url'),
  }));
  validate(credentials); return credentials;
}
function validate(credentials: DemoCredentials) {
  if (!Value.Check(DemoCredentialsSchema, credentials) || new Set(credentials.map(c => c.role)).size !== 3 ||
    new Set(credentials.map(c => c.id)).size !== 3 || new Set(credentials.map(c => c.email)).size !== 3 ||
    credentials.some(c => c.email !== `${c.role}@cenit.invalid`)) throw new Error('Configuración ficticia inconsistente.');
}
export function privateDemoCredentials(root: string, passwords?: DemoPasswords): DemoCredentials {
  const dir = resolve(root, '.local/secrets');
  for (const parent of [resolve(root, '.local'), dir]) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error('No usar enlaces para credenciales.');
    mkdirSync(parent, { recursive: true, mode: 0o700 });
  }
  const file = resolve(dir, 'auth-demo.json');
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('No usar enlaces para credenciales.');
  if (!existsSync(file)) {
    try { writeFileSync(file, JSON.stringify(createDemoCredentials(passwords), null, 2), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const credentials: DemoCredentials = JSON.parse(readFileSync(file, 'utf8'));
  validate(credentials);
  if (passwords && credentials.some(account => account.password !== passwords[account.role])) throw new Error('Las claves configuradas no coinciden con las cuentas privadas existentes. No se rotaron.');
  return credentials;
}
export async function prepareDemoAccounts(pool: pg.Pool, credentials: DemoCredentials): Promise<void> {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Preparación limitada a demo/pruebas.');
  validate(credentials);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(1128615497, 2)');
    for (const credential of credentials) {
      const row = (await db.query<{ id: string; role: string; name: string; active: boolean; password_hash: string }>(
        'SELECT id,role,name,active,password_hash FROM cenit.accounts WHERE email=$1 OR id=$2', [credential.email, credential.id])).rows;
      if (row.length) {
        const account = row[0]!;
        if (row.length !== 1 || account.id !== credential.id || account.role !== credential.role || account.name !== credential.name || !account.active ||
          !await verifyPassword(credential.password, account.password_hash)) throw new Error('Cuenta existente incompatible: no se modificó.');
      } else {
        await db.query('INSERT INTO cenit.accounts(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',
          [credential.id, credential.email, credential.name, credential.role, await hashPassword(credential.password)]);
      }
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
async function main() {
  if (process.argv.length > 2 || process.env.APP_ENV !== 'demo') throw new Error('Usa auth:prepare-demo con APP_ENV=demo.');
  // URL conversion preserves Windows drive letters/spaces; don't depend on workspace cwd.
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const credentials = privateDemoCredentials(repo, demoPasswordsFromEnv(process.env)), pool = createPool();
  try { await prepareDemoAccounts(pool, credentials); console.log('Tres cuentas ficticias preparadas. Credenciales privadas en .local/secrets/auth-demo.json; no se imprimieron ni rotaron.'); }
  finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.error('Preparación de cuentas fallida. Revisa configuración privada, migraciones y coherencia de cuentas. No se imprimieron credenciales.'); process.exitCode = 1;
});
