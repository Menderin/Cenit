import { buildAcademicApp } from './app.js';
import { createPool } from './infrastructure/database/connection.js';
import { AcademicRepository } from './modules/academic/repositories/academic.js';
import { AuthRepository } from './modules/auth/repositories/auth.js';
import { AuthService } from './modules/auth/services/auth.js';
import { readAuthConfig } from './modules/auth/routes/index.js';

async function main() {
  const config = readAuthConfig();
  const pool = createPool();
  const app = buildAcademicApp({ repository: new AcademicRepository(pool), auth: { service: new AuthService(new AuthRepository(pool)), config } });
  app.addHook('onClose', async () => { await pool.end(); });
  app.get('/health/live', () => ({ status: 'live' }));
  // Backend login exists; frontend and the full monolith remain dependencies.
  app.get('/health/ready', (_request, reply) => reply.status(503).send({ status: 'unavailable' }));
  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido.');
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
}
main().catch(() => { console.error('No se pudo iniciar la API académica. Revisa la configuración y sus dependencias.'); process.exitCode = 1; });
