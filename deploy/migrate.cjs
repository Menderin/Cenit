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
    const journal = JSON.parse(readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'));
    const legacyFile = resolve(folder, 'meta/_legacy.json');
    const legacy = existsSync(legacyFile) ? JSON.parse(readFileSync(legacyFile, 'utf8')) : [];
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1128615497, 1)');
    const { rows } = await client.query("SELECT has_schema_privilege(current_user, 'cenit', 'CREATE') AS permitted");
    if (!rows[0]?.permitted) throw new Error('Prepared schema and migration role are required.');
    await client.query('CREATE TABLE IF NOT EXISTS cenit.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    const { rows: applied } = await client.query('SELECT hash,created_at FROM cenit.__drizzle_migrations ORDER BY created_at');
    if (applied.length > migrations.length) throw new Error('Migration history is ahead of this artifact.');
    // Purchases and academic progress were applied on separate branches. Keep their
    // original SQL/hashes and applied entries. The known academic timestamp has an
    // explicit alias so purchases upgrades remain compatible with the previous image.
    const expected = new Map(migrations.map(migration => [String(migration.folderMillis), migration]));
    if (expected.size !== migrations.length) throw new Error('Duplicate artifact migration timestamp.');
    for (const entry of legacy) {
      const migration = migrations[journal.entries.findIndex(item => item.tag === entry.tag)];
      if (!migration || migration.hash !== entry.hash || expected.has(String(entry.when))) throw new Error('Invalid legacy migration alias.');
      expected.set(String(entry.when), migration);
    }
    const completed = new Set();
    for (const entry of applied) {
      const timestamp = String(entry.created_at);
      const migration = expected.get(timestamp);
      if (!migration || completed.has(migration.folderMillis) || migration.hash !== entry.hash) {
        throw new Error('Applied migration differs from the artifact.');
      }
      completed.add(migration.folderMillis);
    }
    for (const migration of migrations.filter(migration => !completed.has(migration.folderMillis))) {
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
