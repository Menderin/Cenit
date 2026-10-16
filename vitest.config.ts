import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@cenit/contracts/purchases': fileURLToPath(new URL('./packages/contracts/src/purchases/index.ts', import.meta.url)), '@cenit/contracts/academic': fileURLToPath(new URL('./packages/contracts/src/academic/index.ts', import.meta.url)), '@cenit/contracts/auth': fileURLToPath(new URL('./packages/contracts/src/auth/index.ts', import.meta.url)), '@cenit/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) } },
  test: { include: ['apps/api/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'packages/contracts/src/**/*.test.ts'], testTimeout: 10000 },
});
