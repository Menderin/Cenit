// Application workspace must declare pg and drizzle-orm as production dependencies.
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');

async function main() {
  const root = resolve(__dirname, '..');
  const file = process.env.DATABASE_URL_FILE;
  if (!file) throw new Error('DATABASE_URL_FILE is required for the migrator.');
  const connectionString = readFileSync(file, 'utf8').trim();
  if (!/^postgres(ql)?:\/\//.test(connectionString)) throw new Error('Invalid database configuration.');
  const folder = resolve(root, 'db/migrations');
  if (!existsSync(resolve(folder, 'meta/_journal.json'))) throw new Error('Versioned migrations are missing.');
  const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
  const { Pool } = apiRequire('pg');
  const { readMigrationFiles } = apiRequire('drizzle-orm/migrator');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    // Infrastructure provisions cenit and its owner. Drizzle's standard migrate() always
    // issues CREATE SCHEMA, requiring database CREATE even when cenit already exists.
    // Use its journal/SQL reader and compatible ledger without widening the VM role.
    const migrations = readMigrationFiles({ migrationsFolder: folder });
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1128615497, 1)');
    const { rows } = await client.query("SELECT has_schema_privilege(current_user, 'cenit', 'CREATE') AS permitted");
    if (!rows[0]?.permitted) throw new Error('Prepared schema and migration role are required.');
    await client.query('CREATE TABLE IF NOT EXISTS cenit.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    const { rows: applied } = await client.query('SELECT hash,created_at FROM cenit.__drizzle_migrations ORDER BY created_at');
    if (applied.length > migrations.length) throw new Error('Migration history is ahead of this artifact.');
    for (let index = 0; index < applied.length; index++) {
      if (applied[index].hash !== migrations[index].hash || BigInt(applied[index].created_at) !== BigInt(migrations[index].folderMillis)) {
        throw new Error('Applied migration differs from the artifact.');
      }
    }
    for (const migration of migrations.slice(applied.length)) {
      for (const statement of migration.sql) if (statement.trim()) await client.query(statement);
      await client.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [migration.hash, migration.folderMillis]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  // Driver errors can include configuration/SQL; keep secrets out of deployment logs.
  console.error('Cenit migration failed. Check configuration, permissions and versioned migrations.');
  process.exitCode = 1;
});
