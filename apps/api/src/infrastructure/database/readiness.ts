import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Snapshot = { tables: Record<string, { name: string; schema: string; columns: Record<string, { name: string }> }> };
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function createReadiness(connectionString: string, migrationsFolder: string) {
  const migrations = readMigrationFiles({ migrationsFolder });
  if (!migrations.length) throw new Error('Faltan migraciones del artefacto.');
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number }[] };
  const last = journal.entries.at(-1)!;
  const snapshot = JSON.parse(readFileSync(join(migrationsFolder, `meta/${String(last.idx).padStart(4, '0')}_snapshot.json`), 'utf8')) as Snapshot;
  // Validate every required column and SELECT privilege without depending on demo rows.
  const relations = Object.values(snapshot.tables).filter(table => table.schema === 'cenit');
  if (!relations.length) throw new Error('Falta el esquema del artefacto.');
  const probe = 'SELECT ' + relations.map((table, index) =>
    `(SELECT count(*) FROM (SELECT ${Object.values(table.columns).map(column => identifier(column.name)).join(',')} FROM ${identifier(table.schema)}.${identifier(table.name)} LIMIT 0) AS probe) AS t${index}`).join(',');
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 1000, statement_timeout: 1000, query_timeout: 1000 });
  pool.on('error', () => { /* A disconnected idle health connection must not crash the runtime. */ });
  return {
    async check(): Promise<boolean> {
      try {
        const { rows } = await pool.query<{ hash: string; created_at: string }>('SELECT hash,created_at FROM cenit.__drizzle_migrations ORDER BY created_at,id');
        if (rows.length < migrations.length || migrations.some((migration, index) =>
          rows[index]?.hash !== migration.hash || BigInt(rows[index]!.created_at) !== BigInt(migration.folderMillis))) return false;
        await pool.query(probe);
        return true;
      } catch { return false; }
    },
    close: () => pool.end(),
  };
}
