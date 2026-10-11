import { buildAcademicApp } from './app.js';
import { createPool } from './infrastructure/database/connection.js';
import { AcademicRepository } from './modules/academic/repositories/academic.js';

async function main() {
  const pool = createPool();
  const app = buildAcademicApp({ repository: new AcademicRepository(pool) });
  app.addHook('onClose', async () => { await pool.end(); });
  app.get('/health/live', () => ({ status: 'live' }));
  // This academic foundation is not yet the full monolith: login/frontend remain dependencies.
  app.get('/health/ready', (_request, reply) => reply.status(503).send({ status: 'unavailable' }));
  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido.');
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
}
main().catch(() => { console.error('No se pudo iniciar la API académica. Revisa la configuración y sus dependencias.'); process.exitCode = 1; });
