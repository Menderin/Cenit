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
      renderButton(element, options) { this.optionsText = options.text;
        const button = document.createElement('button'); button.textContent = this.optionsText === 'signin_with' ? 'Iniciar sesión con Google' : 'Continuar con Google';
        button.onclick = () => this.options.callback({credential: 'fictitious-browser-credential'});
        element.append(button);
      }, cancel() {}, disableAutoSelect() {}
    } } };
  ` }));
  let linked = false;
  let accountRole = 'docente';
  page.on('request', request => {
    if (request.url().endsWith('/auth/login') && request.method() === 'POST') {
      const email = request.postDataJSON().email;
      accountRole = ['administrativo', 'docente', 'estudiante'].find(role => credential(role).email === email) ?? 'docente';
    }
  });
  await page.route('**/api/v1/auth/profile', async route => {
    const { id, email, name, role } = credential(accountRole);
    await route.fulfill({ json: { data: { account: { id, email, name, role }, google: {
      enabled: true, linked, email: linked ? 'fictitious@cenit.invalid' : null, pictureUrl: null,
    } } } });
  });
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
  const trigger = page.getByRole('link', { name: 'Mi perfil', exact: true });
  if (!await trigger.isVisible()) await page.getByRole('button', { name: 'Mostrar navegación', exact: true }).click();
  await trigger.focus(); await trigger.press('Enter');
  const dialog = page.getByRole('region', { name: 'Acceso con Google' });
  await expect(dialog).toBeVisible();
  return dialog;
}
test('Google apagado mantiene el acceso local', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Iniciar sesión con Google/ })).toHaveCount(0);
});
test('acceso Google de pantalla usa sesión Cenit y cierre confirmado', async ({ page }) => {
  await googleBrowser(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true }).click();
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
  await page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar Google');
  await expect(page.getByRole('button', { name: 'Reintentar Google' })).toBeFocused();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
  await login(page, 'docente');
  await expect(page).toHaveURL(/\/academico$/);
});
test('cancelar descarta callbacks tardíos y restaura el formulario local', async ({ page }) => {
  await googleBrowser(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/google/challenge', async route => {
    await pending;
    await route.fulfill({ json: { data: { nonce: 'a'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString() } } }).catch(() => {});
  });
  let submissions = 0;
  page.on('request', request => { if (request.url().endsWith('/auth/google/login')) submissions++; });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Cancelar intento' }).click();
  release();
  await page.evaluate(() => window.dispatchEvent(new Event('test-google-callback')));
  await expect(page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
  expect(submissions).toBe(0);
});
for (const role of ['administrativo', 'docente', 'estudiante']) test(`vinculación explícita y teclado desde cuenta local ${role}`, async ({ page }) => {
  await googleBrowser(page);
  await login(page, role);
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(dialog.getByText('Cuenta Google vinculada.', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toHaveCount(0);
  await openLink(page);
  await expect(dialog).toContainText('Cuenta Google vinculada');
});
test('una credencial Google inválida conserva una sesión local válida', async ({ page }) => {
  await googleBrowser(page, 401);
  await login(page, 'docente');
  const dialog = await openLink(page);
  await dialog.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo verificar Google');
  await expect(page.locator('.workspace-account')).toContainText(credential('docente').name);
});
test('Google inaccesible conserva el formulario y ofrece reintentar', async ({ page }) => {
  await googleBrowser(page);
  await page.route('https://accounts.google.com/gsi/client', route => route.abort());
  await page.goto('/login');
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar Google');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
});
test('el perfil y la vinculación caben en móvil y permiten regresar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await googleBrowser(page);
  await login(page, 'docente');
  const dialog = await openLink(page);
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Malla curricular', exact: true })).toBeVisible();
});
test('vencer la sesión descarta la vinculación y su callback tardío', async ({ page }) => {
  await googleBrowser(page);
  await page.clock.install();
  await login(page, 'docente');
  const dialog = await openLink(page);
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
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
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
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
  expect(writes).toBe(0);
});
for (const role of ['administrativo', 'docente', 'estudiante']) test(`perfil real de la cuenta local ${role}`, async ({ page }) => {
  const account = await login(page, role);
  const link = page.getByRole('link', { name: 'Mi perfil', exact: true });
  if (!await link.isVisible()) await page.getByRole('button', { name: 'Mostrar navegación', exact: true }).click();
  await link.click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible();
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  await expect(page.getByText('El acceso con Google está deshabilitado en este entorno.')).toBeVisible();
  await page.reload();
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
});
test('foto Google del perfil y retorno a inicial si la imagen falla', async ({ page }) => {
  await googleBrowser(page);
  await page.route('https://lh3.googleusercontent.com/a/fictitious', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#777"/></svg>' }));
  await page.route('**/api/v1/auth/profile', async route => {
    const { id, email, name, role } = credential('docente');
    await route.fulfill({ json: { data: { account: { id, email, name, role }, google: { enabled: true, linked: true, email: 'fictitious@cenit.invalid', pictureUrl: 'https://lh3.googleusercontent.com/a/fictitious' } } } });
  });
  const account = await login(page, 'docente');
  await openLink(page);
  const image = page.getByRole('img', { name: `Foto de perfil de ${account.name}` });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  const sidebarImage = page.locator('.workspace-account img');
  await expect(sidebarImage).toHaveAttribute('src', await image.getAttribute('src') ?? '');
  await expect.poll(() => sidebarImage.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Mi perfil', exact: true })).toHaveCount(1);
  await page.route('https://lh3.googleusercontent.com/a/fictitious', route => route.abort());
  await page.reload();
  await expect(page.getByLabel('Avatar con inicial')).toHaveText('D');
  await expect(image).toHaveCount(0);
  await expect(sidebarImage).toHaveCount(0);
});
test('abrir perfil desde el usuario conserva el aviso de borrador modificado', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras/nueva');
  const number = page.getByLabel('Nº Documento / solicitud *', { exact: true });
  await number.fill('PROFILE-NAVIGATION-DRAFT');
  const accountLink = page.getByRole('link', { name: 'Mi perfil', exact: true });
  await accountLink.click();
  const confirmation = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(number).toHaveValue('PROFILE-NAVIGATION-DRAFT');
  await accountLink.click();
  await confirmation.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
});
