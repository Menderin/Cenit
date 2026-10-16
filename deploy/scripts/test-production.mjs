import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.production.config.ts', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, CENIT_E2E_RUNTIME: 'production' },
});
child.on('error', () => { console.error('No se pudieron iniciar las pruebas de producción.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
