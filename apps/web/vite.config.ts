import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: {
    '@cenit/contracts/purchases/examples': fileURLToPath(new URL('../../packages/contracts/src/purchases/examples.ts', import.meta.url)),
    '@cenit/contracts/purchases': fileURLToPath(new URL('../../packages/contracts/src/purchases/index.ts', import.meta.url)),
    '@cenit/contracts/assets': fileURLToPath(new URL('../../packages/contracts/src/assets/index.ts', import.meta.url)),
    '@cenit/contracts/auth': fileURLToPath(new URL('../../packages/contracts/src/auth/index.ts', import.meta.url)),
    '@cenit/contracts/academic': fileURLToPath(new URL('../../packages/contracts/src/academic/index.ts', import.meta.url)),
    '@cenit/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
  } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: process.env.CENIT_API_PROXY ?? 'http://127.0.0.1:3000', changeOrigin: false } } },
});
