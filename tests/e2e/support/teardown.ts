import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
export default async function teardown() {
  // File handshake works on Windows, where terminating a webServer is not graceful.
  writeFileSync('tmp/e2e-auth/stop', 'stop');
  for (let i = 0; i < 150; i++) {
    if (existsSync('tmp/e2e-auth/stopped')) return;
    await setTimeout(100);
  }
  throw new Error('La infraestructura descartable del navegador no confirmó su limpieza.');
}
