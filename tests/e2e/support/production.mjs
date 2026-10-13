// Disposable browser harness: use the compiled runtime, with a test-only login budget.
import { createRuntimeApp } from '../../../apps/api/dist/runtime.js';
const app = createRuntimeApp();
app.addHook('onRoute', route => {
  if (route.url === '/api/v1/auth/login') route.config = { ...route.config, rateLimit: { max: 100, timeWindow: '1 minute' } };
});
await app.listen({ host: '127.0.0.1', port: 5174 });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void app.close(); });
