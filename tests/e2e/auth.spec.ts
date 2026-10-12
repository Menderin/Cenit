import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { DemoCredentials } from '../../db/seeds/auth-demo.js';

const credential = (role: string) => (JSON.parse(readFileSync('tmp/e2e-auth/credentials.json', 'utf8')) as DemoCredentials).find(c => c.role === role)!;
async function login(page: Page, role = 'docente') {
  const account = credential(role);
  await page.goto('/login');
  await page.getByLabel('Correo', { exact: true }).fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  return account;
}
for (const role of ['administrativo', 'docente', 'estudiante']) {
  test(`login, recarga y aislamiento de rutas: ${role}`, async ({ page }) => {
    const account = await login(page, role), path = role === 'administrativo' ? '/compras' : '/academico';
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText(account.name, { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText(account.name, { exact: true })).toBeVisible();
    await page.goto(path === '/compras' ? '/academico' : '/compras');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto('/login'); await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}
test('sin sesión no muestra módulos y credenciales incorrectas no ingresan', async ({ page }) => {
  await page.goto('/compras'); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Correo', { exact: true }).fill(credential('docente').email);
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
});
test('logout invalida cookie, atrás no restaura cuenta y permite otra identidad', async ({ page, context }) => {
  const account = await login(page, 'administrativo');
  // Leave a real protected document in history, rather than returning to about:blank.
  await page.goto('/compras?prueba=historial');
  await expect(page.getByText(account.name, { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(c => c.name === 'cenit_session')!;
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const response = await context.request.get('/api/v1/auth/session', { headers: { Cookie: `${cookie.name}=${cookie.value}` } });
  expect(response.status()).toBe(401);
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
  const second = await login(page, 'estudiante');
  await expect(page.getByText(second.name, { exact: true })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
test('expiración del reloj del navegador oculta cuenta y pide login', async ({ page }) => {
  await page.clock.install();
  const account = await login(page);
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
test('avisa cinco minutos antes, actualiza el tiempo y vence sin renovación', async ({ page }) => {
  await page.clock.install();
  await login(page, 'administrativo');
  await expect(page.getByRole('complementary', { name: 'Aviso de vencimiento de sesión' })).toHaveCount(0);
  await page.clock.fastForward(6901000);
  await expect(page.getByRole('status')).toHaveText('Tu sesión vencerá en 5 minutos. Guarda tu trabajo antes de volver a iniciar sesión.');
  await expect(page).toHaveURL(/\/compras$/);
  await page.clock.fastForward(240000);
  await expect(page.getByRole('status')).toHaveText('Tu sesión vencerá en 1 minuto. Guarda tu trabajo antes de volver a iniciar sesión.');
  await page.clock.fastForward(60000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
});
test('el aviso permite cerrar la sesión antes del vencimiento', async ({ page }) => {
  await page.clock.install();
  await login(page, 'estudiante');
  await page.clock.fastForward(6901000);
  await page.getByRole('button', { name: 'Cerrar sesión ahora', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Sesión cerrada.');
  expect((await page.request.get('/api/v1/auth/session')).status()).toBe(401);
});
test('401 al revalidar oculta cuenta y avisa', async ({ page }) => {
  const account = await login(page);
  await page.route('**/api/v1/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.', requestId: 'test' } }) }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
test('fallo de logout oculta contenido y permite reintentar sin falso éxito', async ({ page }) => {
  const account = await login(page);
  await page.route('**/api/v1/auth/logout', route => route.abort());
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo confirmar el cierre de sesión.');
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/auth/logout');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test('fallos de comprobación y login muestran error sin acceder', async ({ page }) => {
  await page.route('**/api/v1/auth/session', route => route.abort());
  await page.goto('/academico');
  await expect(page.getByRole('alert')).toHaveText('No se pudo comprobar la sesión. Intenta nuevamente.');
  await page.unroute('**/api/v1/auth/session');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.route('**/api/v1/auth/login', route => route.abort());
  await page.getByLabel('Correo', { exact: true }).fill(credential('docente').email);
  await page.getByLabel('Contraseña', { exact: true }).fill(credential('docente').password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo conectar con el servidor. Intenta nuevamente.');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
});
test('respuesta de sesión pendiente no restaura datos después de expirar', async ({ page }) => {
  const account = await login(page);
  const session = await (await page.request.get('/api/v1/auth/session')).json();
  // A refresh hides protected UI immediately; a late response must not outlive expiration.
  await page.clock.install();
  let release: (() => void) | undefined;
  await page.route('**/api/v1/auth/session', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }).catch(() => {});
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.clock.fastForward(7201000);
  release!();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
