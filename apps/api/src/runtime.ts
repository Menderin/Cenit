import { fileURLToPath } from 'node:url';
import { buildAcademicApp } from './app.js';
import { createPool, databaseUrl } from './infrastructure/database/connection.js';
import { createReadiness } from './infrastructure/database/readiness.js';
import { AcademicRepository } from './modules/academic/repositories/academic.js';
import { AuthRepository } from './modules/auth/repositories/auth.js';
import { AuthService } from './modules/auth/services/auth.js';
import { readAuthConfig } from './modules/auth/routes/index.js';
import { PurchaseRepository } from './modules/purchases/repositories/purchases.js';

export function createRuntimeApp() {
  const config = readAuthConfig();
  const pool = createPool();
  const readiness = createReadiness(databaseUrl(), fileURLToPath(new URL('../../../db/migrations/', import.meta.url)));
  const app = buildAcademicApp({ repository: new AcademicRepository(pool), purchases: new PurchaseRepository(pool), frontendRoot: process.env.NODE_ENV === 'production' ? fileURLToPath(new URL('../../web/dist/', import.meta.url)) : undefined, auth: { service: new AuthService(new AuthRepository(pool)), config } });
  app.addHook('onClose', async () => { await Promise.all([pool.end(), readiness.close()]); });
  app.get('/health/live', () => ({ status: 'live' }));
  app.get('/health/ready', async (_request, reply) => {
    const ready = await readiness.check();
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });
  return app;
}
