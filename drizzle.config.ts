import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql', schema: ['./db/schema/academic.ts', './db/schema/auth.ts', './db/schema/academic-progress.ts'], out: './db/migrations',
  migrations: { schema: 'cenit', table: '__drizzle_migrations' },
});
