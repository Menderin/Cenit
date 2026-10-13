import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';

export function registerFrontend(app: FastifyInstance, root: string) {
  if (!existsSync(join(root, 'index.html'))) throw new Error('Falta el frontend compilado. Ejecuta npm run build.');
  app.register(staticFiles, { root, wildcard: false, index: false, dotfiles: 'deny' });
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0]!;
    const reserved = /^\/(?:api|health|assets)(?:\/|$)/.test(path);
    const legacy = path === '/prototipo.html';
    const known = legacy || path === '/' || path === '/login' || path === '/compras' || path === '/academico' || /^\/administracion(?:\/|$)/.test(path);
    if (['GET', 'HEAD'].includes(request.method) && !reserved && (!path.includes('.') || legacy) &&
        (known || request.headers.accept?.includes('text/html'))) return reply.type('text/html').sendFile('index.html');
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso inexistente.', requestId: request.id } });
  });
}
