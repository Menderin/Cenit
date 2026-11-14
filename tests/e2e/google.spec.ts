import { expect, test, type Page } from '@playwright/test';
import { credential, login } from './support/browser.js';

// Browser doubles cover UI states. Cryptographic and PostgreSQL checks run
// separately in the Google unit and integration suites.
async function googleBrowser(page: Page, failure?: 401 | 403 | 503) {
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: {
      initialize(options) {
        this.options = options;
        window.addEventListener('test-google-callback', () => options.callback({credential: 'fictitious-browser-credential'}));
      },
      renderButton(element) {
        const button = document.createElement('button'); button.textContent = 'Continuar con Google';
        button.onclick = () => this.options.callback({credential: 'fictitious-browser-credential'});
        element.append(button);
      }, cancel() {}, disableAutoSelect() {}
    } } };
  ` }));
  let linked = false;
  await page.route('**/api/v1/auth/google', route => route.fulfill({ json: { data: { enabled: true, clientId: 'browser-demo.apps.googleusercontent.com' } } }));
  await page.route('**/api/v1/auth/google/challenge', route => route.fulfill({ json: { data: { nonce: 'a'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString() } } }));
  await page.route('**/api/v1/auth/google/link', async route => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ credential: 'fictitious-browser-credential' });
      if (failure) { await route.fulfill({ status: failure, json: { error: { code: 'GOOGLE_REJECTED', message: 'No se pudo verificar Google. Reintenta.', requestId: 'browser-test' } } }); return; }
      linked = true;
    }
    await route.fulfill({ json: { data: { linked } } });
  });
  await page.route('**/api/v1/auth/google/login', async route => {
    expect(route.request().postDataJSON()).toEqual({ credential: 'fictitious-browser-credential' });
    if (failure) { await route.fulfill({ status: failure, json: { error: { code: 'GOOGLE_REJECTED', message: 'No se pudo verificar Google. Reintenta.', requestId: 'browser-test' } } }); return; }
    const account = credential('docente');
    const response = await page.request.post('/api/v1/auth/login', { headers: { origin: 'http://127.0.0.1:5174' }, data: { email: account.email, password: account.password } });
    expect(response.status()).toBe(200);
    await route.fulfill({ response });
  });
}
async function openLink(page: Page) {
  const trigger = page.getByRole('button', { name: 'Acceso con Google', exact: true });
  if (!await trigger.isVisible()) await page.getByRole('button', { name: 'Mostrar navegación', exact: true }).click();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Acceso con Google' });
  await expect(dialog).toBeVisible();
  return dialog;
}
test('Google apagado mantiene el acceso local', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Preparar acceso con Google/ })).toHaveCount(0);
});
test('acceso Google de pantalla usa sesión Cenit y cierre confirmado', async ({ page }) => {
  await googleBrowser(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Preparar acceso con Google' }).click();
  await page.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(page).toHaveURL(/\/academico$/);
  await page.goto('/academico?review=google');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.workspace-account')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
});
for (const failure of [401, 403, 503] as const) test(`Google ${failure} permite reintentar y usar contraseña`, async ({ page }) => {
  await googleBrowser(page, failure);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Preparar acceso con Google' }).click();
  await page.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar Google');
  await expect(page.getByRole('button', { name: 'Preparar acceso con Google' })).toBeFocused();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
  await login(page, 'docente');
  await expect(page).toHaveURL(/\/academico$/);
});
test('cancelar descarta callbacks tardíos y restaura el formulario local', async ({ page }) => {
  await googleBrowser(page);
  let submissions = 0;
  page.on('request', request => { if (request.url().endsWith('/auth/google/login')) submissions++; });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Preparar acceso con Google' }).click();
  await expect(page.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar intento' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('test-google-callback')));
  await expect(page.getByRole('button', { name: 'Continuar con Google', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
  expect(submissions).toBe(0);
});
for (const role of ['administrativo', 'docente', 'estudiante']) test(`vinculación explícita y teclado desde cuenta local ${role}`, async ({ page }) => {
  await googleBrowser(page);
  await login(page, role);
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Preparar vinculación con Google' }).click();
  await dialog.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Cuenta Google vinculada');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Acceso con Google', exact: true })).toBeFocused();
  await openLink(page);
  await expect(dialog).toContainText('Tu cuenta ya tiene una identidad Google vinculada');
});
test('una credencial Google inválida conserva una sesión local válida', async ({ page }) => {
  await googleBrowser(page, 401);
  await login(page, 'docente');
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Preparar vinculación con Google' }).click();
  await dialog.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo verificar Google');
  await expect(page.locator('.workspace-account')).toContainText(credential('docente').name);
});
test('Google inaccesible conserva el formulario y ofrece reintentar', async ({ page }) => {
  await googleBrowser(page);
  await page.route('https://accounts.google.com/gsi/client', route => route.abort());
  await page.goto('/login');
  await page.getByRole('button', { name: 'Preparar acceso con Google' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar Google');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
});
test('el diálogo de vinculación cabe en móvil y devuelve el foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await googleBrowser(page);
  await login(page, 'docente');
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Preparar vinculación con Google' }).click();
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Acceso con Google', exact: true })).toBeFocused();
});
test('vencer la sesión descarta la vinculación y su callback tardío', async ({ page }) => {
  await googleBrowser(page);
  await page.clock.install();
  await login(page, 'docente');
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Preparar vinculación con Google' }).click();
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/google/link')) writes++; });
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await page.evaluate(() => window.dispatchEvent(new Event('test-google-callback')));
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
});
test('cambiar de cuenta descarta el intento de vinculación anterior', async ({ page }) => {
  await googleBrowser(page);
  await login(page, 'docente');
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Preparar vinculación con Google' }).click();
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  const account = credential('estudiante');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.locator('.workspace-account')).toContainText(account.name);
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/google/link')) writes++; });
  await page.evaluate(() => window.dispatchEvent(new Event('test-google-callback')));
  await openLink(page);
  await expect(dialog.getByRole('button', { name: 'Preparar vinculación con Google' })).toBeVisible();
  expect(writes).toBe(0);
});
