import { createRuntimeApp } from './runtime.js';

async function main() {
  const app = createRuntimeApp();
  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido.');
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
}
main().catch(error => {
  console.error(error instanceof Error && error.message === 'Falta el frontend compilado. Ejecuta npm run build.'
    ? error.message : 'No se pudo iniciar Cenit. Revisa la configuración y sus dependencias.');
  process.exitCode = 1;
});
