import { test, expect } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createTestPool, closeTestPool } from './support/postgres.js';
import { createDemoCredentials, prepareDemoAccounts } from '../../db/seeds/auth-demo.js';
import { loadCatalog, readCatalog } from '../../db/seeds/load-academic.js';
import { seedAcademicDemo } from '../../db/seeds/academic-demo.js';
import { PurchaseRepository } from '../../apps/api/src/modules/purchases/repositories/purchases.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { createReadiness } from '../../apps/api/src/infrastructure/database/readiness.js';

const folder = resolve('db/migrations');
const migrations = readMigrationFiles({ migrationsFolder: folder });
const progress = migrations.at(-1)!;
const adminUrl = process.env.ACADEMIC_TEST_ADMIN_URL_FILE ? readFileSync(process.env.ACADEMIC_TEST_ADMIN_URL_FILE, 'utf8').trim()
  : process.env.DATABASE_URL ?? (() => { const url = new URL('postgres://cenit_admin@127.0.0.1:55432/cenit_demo'); url.password = readFileSync('.local/secrets/postgres-password', 'utf8').trim(); return url.toString(); })();

for (const source of ['academic', 'purchases']) {
  test(`integra el historial previo de ${source} sin alterar datos ni entradas aplicadas`, async () => {
    process.env.APP_ENV = 'test';
    // These are the hash/timestamp already used by malla-interactiva, not a new migration.
    expect(progress.hash).toBe('06868cc13dd3edc627b138fb0055d0507953bab8b65d2b63c5e60933cbc1e493');
    expect(progress.folderMillis).toBeGreaterThan(migrations.at(-2)!.folderMillis);
    const suffix = randomBytes(6).toString('hex');
    const database = `cenit_branch_migration_${suffix}`, role = `branch_migrator_${suffix}`;
    const admin = createTestPool({ connectionString: adminUrl });
    const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${database}`;
    const provisioner = createTestPool({ connectionString: dbUrl.toString() });
    const password = randomBytes(24).toString('hex');
    const migrationUrl = new URL(dbUrl); migrationUrl.username = role; migrationUrl.password = password;
    const pool = createTestPool({ connectionString: migrationUrl.toString() });
    const root = resolve('tmp/migration-branches', suffix); mkdirSync(root, { recursive: true, mode: 0o700 });
    const file = resolve(root, 'migration-url'); writeFileSync(file, migrationUrl.toString(), { mode: 0o600 });
    const run = () => execFileSync(process.execPath, ['deploy/migrate.cjs'], { env: { ...process.env, DATABASE_URL_FILE: file }, stdio: 'pipe' });
    const ledger = async () => (await pool.query('SELECT id,hash,created_at FROM cenit.__drizzle_migrations ORDER BY id')).rows;
    const accountFingerprint = async () => createHash('sha256').update(JSON.stringify((await pool.query('SELECT * FROM cenit.accounts ORDER BY id')).rows)).digest('hex');
    let health: ReturnType<typeof createReadiness> | undefined;
    try {
      await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
      await admin.query(`CREATE DATABASE ${database}`);
      await provisioner.query(`CREATE SCHEMA cenit AUTHORIZATION ${role}; REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
      await pool.query('CREATE TABLE cenit.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
      const previous = source === 'academic' ? [...migrations.slice(0, 3), progress] : migrations.filter(migration => migration !== progress);
      for (const migration of previous) {
        for (const sql of migration.sql) if (sql.trim()) await pool.query(sql);
        await pool.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [migration.hash, source === 'academic' && migration === progress ? 1791853110098 : migration.folderMillis]);
      }
      const credentials = createDemoCredentials();
      await prepareDemoAccounts(pool, credentials);
      const catalog = readCatalog('catalogs/academic/nutricion-2027-r1.json');
      const student = credentials.find(account => account.role === 'estudiante')!;
      let purchaseId: string | undefined;
      if (source === 'academic') {
        await loadCatalog(pool, catalog, true);
        await seedAcademicDemo(pool, catalog.planId, catalog.version, [{ id: randomUUID(), accountId: student.id, name: student.name, rut: '20.123.456-5', attempts: [{ code: catalog.courses[0]!.code, attempt: { attemptNumber: 1, status: 'passed', grade: '5,2' } }] }]);
      } else {
        const saved = await new PurchaseRepository(pool).create({ ...structuredClone(manualPurchaseExample), operationId: randomUUID() }, credentials.find(account => account.role === 'administrativo')!.id);
        purchaseId = saved.record.id;
      }
      const rowsBefore = await ledger();
      const accountsBefore = await accountFingerprint();
      const record = async () => source === 'academic' ? (await pool.query('SELECT * FROM cenit.academic_attempts ORDER BY id')).rows : await new PurchaseRepository(pool).get(purchaseId!);
      const dataBefore = await record();
      health = createReadiness(migrationUrl.toString(), folder);
      expect(await health.check()).toBe(false);
      // Reject a duplicated known entry even while the history is still incomplete.
      const firstBefore = rowsBefore[0]!;
      await pool.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [firstBefore.hash, firstBefore.created_at]);
      const invalidBefore = await ledger();
      expect(() => run()).toThrow(/migration failed/i);
      expect(await ledger()).toEqual(invalidBefore);
      await pool.query('DELETE FROM cenit.__drizzle_migrations WHERE id=$1', [invalidBefore.at(-1)!.id]);
      run(); run();
      const rowsAfter = await ledger();
      expect(rowsAfter).toHaveLength(migrations.length);
      expect(rowsAfter.slice(0, rowsBefore.length)).toEqual(rowsBefore);
      expect(await accountFingerprint()).toBe(accountsBefore);
      expect(await record()).toEqual(dataBefore);
      expect(await health.check()).toBe(true);
      if (source === 'purchases') {
        // The previous purchases image checks this prefix by timestamp. Its readiness
        // must still succeed after the additive academic migration, including rollback.
        const ordered = (await pool.query('SELECT hash,created_at FROM cenit.__drizzle_migrations ORDER BY created_at,id')).rows;
        expect(ordered.slice(0, previous.length)).toEqual(previous.map(migration => ({ hash: migration.hash, created_at: String(migration.folderMillis) })));
      }
      // A known migration repeated in the ledger is still corruption, even with a valid hash.
      const first = rowsAfter[0]!;
      await pool.query('INSERT INTO cenit.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [first.hash, first.created_at]);
      const duplicate = await ledger();
      expect(() => run()).toThrow(/migration failed/i);
      expect(await ledger()).toEqual(duplicate);
      expect(await health.check()).toBe(false);
      await pool.query('DELETE FROM cenit.__drizzle_migrations WHERE id=$1', [duplicate.at(-1)!.id]);
      expect(await health.check()).toBe(true);
    } finally {
      if (health) await health.close();
      await closeTestPool(pool); await closeTestPool(provisioner);
      await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
      await closeTestPool(admin); rmSync(root, { recursive: true, force: true });
    }
  });
}
