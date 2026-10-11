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
  const { drizzle } = apiRequire('drizzle-orm/node-postgres');
  const { migrate } = apiRequire('drizzle-orm/node-postgres/migrator');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder, migrationsSchema: 'cenit', migrationsTable: '__drizzle_migrations' });
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  // Driver errors can include configuration/SQL; keep secrets out of deployment logs.
  console.error('Cenit migration failed. Check configuration, permissions and versioned migrations.');
  process.exitCode = 1;
});
