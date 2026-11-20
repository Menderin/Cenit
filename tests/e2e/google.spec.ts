import { expect, test, type Page } from '@playwright/test';
import { credential, login } from './support/browser.js';

// Browser doubles cover UI states. Cryptographic and PostgreSQL checks run
// separately in the Google unit and integration suites.
async function googleBrowser(page: Page, linkFailure?: 401) {
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: {
      initialize(options) {
        this.options = options;
        window.addEventListener('test-google-callback', event => {
          event.preventDefault();
          options.callback({credential: 'fictitious-browser-credential'});
        });
      },
      renderButton(element, options) { this.optionsText = options.text;
        const button = document.createElement('button'); button.textContent = this.optionsText === 'signin_with' ? 'Iniciar sesión con Google' : 'Continuar con Google';
        button.dataset.nonce = this.options.nonce;
        button.onclick = () => this.options.callback({credential: 'fictitious-browser-credential'});
        element.append(button);
      }, cancel() {}, disableAutoSelect() {}
    } } };
  ` }));
  let linked = false;
  let challenges = 0;
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
  await page.route('**/api/v1/auth/google/challenge', route => route.fulfill({ json: { data: { nonce: (++challenges).toString(16).padStart(64, '0'), expiresAt: new Date(Date.now() + 300000).toISOString() } } }));
  await page.route('**/api/v1/auth/google/link', async route => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ credential: 'fictitious-browser-credential' });
      if (linkFailure) { await route.fulfill({ status: linkFailure, json: { error: { code: 'GOOGLE_REJECTED', message: 'No se pudo verificar Google. Reintenta.', requestId: 'browser-test' } } }); return; }
      linked = true;
    }
    await route.fulfill({ json: { data: { linked } } });
  });
  await page.route('**/api/v1/auth/google/login', async route => {
    expect(route.request().postDataJSON()).toEqual({ credential: 'fictitious-browser-credential' });
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

async function expectDiscardedGoogleCallback(page: Page, purpose: 'login' | 'link') {
  const observation = await page.evaluate(purpose => {
    const originalFetch = window.fetch;
    let submissions = 0;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, window.location.href);
      if (url.pathname === `/api/v1/auth/google/${purpose}` && init?.method === 'POST') submissions++;
      return originalFetch(input, init);
    };
    try {
      // Sólo el doble de GIS cancela el evento, justo antes de entregar la credencial.
      const delivered = !window.dispatchEvent(new Event('test-google-callback', { cancelable: true }));
      return { delivered, submissions };
    } finally { window.fetch = originalFetch; }
  }, purpose);
  expect(observation).toEqual({ delivered: true, submissions: 0 });
}

test('Google apagado deja el botón visible y el acceso local en la misma posición', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let finishSession!: () => void;
  const sessionPending = new Promise<void>(resolve => { finishSession = resolve; });
  await page.route('**/api/v1/auth/session', async route => { await sessionPending; await route.continue(); });
  const positions = () => page.locator('.cenit-access__heading, #email, #password, button[type="submit"], .google-access__action button, .cenit-access__institution')
    .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  const submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
  const google = page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true });
  const email = page.getByLabel('Correo electrónico', { exact: true });
  const password = page.getByLabel('Contraseña', { exact: true });
  try {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Comprobando sesión…');
    await expect(submit).toBeDisabled();
    await expect(google).toBeVisible();
    await expect(google).toBeDisabled();
    const initial = await positions();
    const initialEmail = await email.elementHandle();

    finishSession();
    await expect(page).toHaveURL(/\/login$/);
    await expect(submit).toBeEnabled();
    expect(await initialEmail?.evaluate(element => element.isConnected)).toBe(true);
    await expect(google).toHaveAccessibleDescription('El acceso con Google no está habilitado.');
    expect(await positions()).toEqual(initial);

    await submit.click();
    await expect(page.getByRole('alert')).toHaveCount(2);
    expect(await positions()).toEqual(initial);

    await email.fill('cuenta-inexistente@cenit.invalid');
    await password.fill('clave-ficticia');
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
    expect(await positions()).toEqual(initial);
  } finally {
    finishSession();
  }
});
test('el login mantiene su posición mientras se prepara el botón de Google', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await googleBrowser(page);
  let showProvider!: () => void, showButton!: () => void;
  const providerPending = new Promise<void>(resolve => { showProvider = resolve; });
  const challengePending = new Promise<void>(resolve => { showButton = resolve; });
  await page.route('**/api/v1/auth/google', async route => { await providerPending; await route.fallback(); });
  await page.route('**/api/v1/auth/google/challenge', async route => { await challengePending; await route.fallback(); });
  const positions = () => page.locator('.cenit-access__heading, .cenit-access__form, .cenit-access__institution')
    .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  try {
    await page.goto('/login');
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
    const initial = await positions();

    showProvider();
    const cancel = page.getByRole('button', { name: 'Cancelar intento' });
    await expect(cancel).toBeVisible();
    const googleTop = (await cancel.boundingBox())?.y;
    expect(await positions()).toEqual(initial);

    showButton();
    const googleButton = page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true });
    await expect(googleButton).toBeVisible();
    expect((await googleButton.boundingBox())?.y).toBe(googleTop);
    expect(await positions()).toEqual(initial);
  } finally {
    showProvider();
    showButton();
  }
});
test('acceso Google de pantalla usa sesión Cenit y cierre confirmado', async ({ page }) => {
  await googleBrowser(page);
  await page.goto('/login');
  const google = page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true });
  await expect(google).toHaveAttribute('data-nonce', '1'.padStart(64, '0'));
  await page.getByLabel('Correo electrónico', { exact: true }).fill('cuenta-inexistente@cenit.invalid');
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-ficticia');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await expect(google).toHaveAttribute('data-nonce', '1'.padStart(64, '0'));
  await google.click();
  await expect(page).toHaveURL(/\/academico$/);
  await page.goto('/academico?review=google');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.workspace-account')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
});
test('un error transitorio de Google permite entrar tras reintentar con un desafío nuevo', async ({ page }) => {
  await googleBrowser(page);
  let attempts = 0;
  await page.route('**/api/v1/auth/google/login', route => {
    if (++attempts > 1) return route.fallback();
    return route.fulfill({ status: 503, json: { error: { code: 'GOOGLE_UNAVAILABLE', message: 'No se pudo verificar Google. Reintenta.', requestId: 'browser-test' } } });
  });
  await page.goto('/login');
  const googleButton = page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true });
  await expect(googleButton).toHaveAttribute('data-nonce', '1'.padStart(64, '0'));
  await googleButton.click();
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar Google');
  const retry = page.getByRole('button', { name: 'Reintentar Google' });
  await expect(retry).toBeFocused();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
  await retry.press('Enter');
  await expect(googleButton).toHaveAttribute('data-nonce', '2'.padStart(64, '0'));
  await googleButton.click();
  await expect(page).toHaveURL(/\/academico$/);
  expect(attempts).toBe(2);
});
test('cancelar un desafío pendiente mantiene disponible el acceso con contraseña', async ({ page }) => {
  await googleBrowser(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/google/challenge', async route => {
    await pending;
    await route.fulfill({ json: { data: { nonce: 'a'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString() } } }).catch(() => {});
  });
  const challenge = page.waitForRequest('**/api/v1/auth/google/challenge');
  await page.goto('/login');
  await challenge;
  await page.getByRole('button', { name: 'Cancelar intento' }).click();
  release();
  await expect(page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true })).toHaveCount(0);
  const account = credential('docente');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/academico$/);
});

test('un callback Google registrado se ignora al vencer el desafío de acceso', async ({ page }) => {
  await googleBrowser(page);
  let showProvider!: () => void;
  const providerPending = new Promise<void>(resolve => { showProvider = resolve; });
  await page.route('**/api/v1/auth/google', async route => { await providerPending; await route.fallback(); });
  await page.clock.install();
  try {
    await page.goto('/login');
    const googleButton = page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true });
    await expect(googleButton).toBeDisabled();
    showProvider();
    await expect(googleButton).toHaveAttribute('data-nonce', '1'.padStart(64, '0'));
    await page.clock.fastForward(305_000);
    await expect(page.getByRole('alert')).toContainText('El intento venció');
    await expectDiscardedGoogleCallback(page, 'login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
  } finally {
    showProvider();
  }
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
  await expect(page.getByRole('button', { name: 'Reintentar Google' })).toBeFocused();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled();
});
test('el perfil y la vinculación permiten regresar en escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expectDiscardedGoogleCallback(page, 'link');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
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
  await expectDiscardedGoogleCallback(page, 'link');
  await openLink(page);
  await expect(dialog.getByRole('button', { name: 'Continuar con Google', exact: true })).toBeVisible();
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
