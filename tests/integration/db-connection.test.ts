import { afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTestPool, closeTestPool } from './support/postgres.js';

const connectionString = process.env.ACADEMIC_TEST_ADMIN_URL_FILE
  ? readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim()
  : process.env.DATABASE_URL ?? (() => {
      const url = new URL('postgres://cenit_admin@127.0.0.1:55432/cenit_demo');
      url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim();
      return url.toString();
    })();

const pool = createTestPool({ connectionString });

afterAll(async () => {
  await closeTestPool(pool);
});

describe('Conexión con PostgreSQL', () => {
  test('responde a una consulta SELECT 1', async () => {
    const result = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    expect(result.rows[0]?.ok).toBe(1);
  });

});
