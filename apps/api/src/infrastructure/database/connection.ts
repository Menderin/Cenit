import { readFileSync } from 'node:fs';
import pg from 'pg';
export function databaseUrl(): string {
  const value = process.env.DATABASE_URL_FILE ? readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim() : process.env.DATABASE_URL;
  if (!value || !/^postgres(ql)?:\/\//.test(value)) throw new Error('Configura DATABASE_URL_FILE o DATABASE_URL para PostgreSQL.');
  return value;
}
export function createPool() {
  return new pg.Pool({ connectionString: databaseUrl(), max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
}
