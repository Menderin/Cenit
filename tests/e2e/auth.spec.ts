import { test, expect, type Page } from '@playwright/test';
import { credential, login, santiagoToday, selectRangeDay } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

async function navigateAdministration(page: Page, name: string) {
  const navigation = page.getByRole('navigation', { name: 'Sistemas administrativos' });
  const show = page.getByRole('button', { name: 'Mostrar navegación', exact: true });
  if (await show.isVisible()) await show.click();
  const link = navigation.getByRole('link', { name, exact: true });
  const path = await link.getAttribute('href');
  const changesPage = new URL(page.url()).pathname !== path;
  await link.click();
  if (changesPage) await expect.poll(async () => new URL(page.url()).pathname === path || await page.getByRole('alertdialog').isVisible()).toBe(true);
}

async function logout(page: Page) {
  const response = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/v1/auth/logout' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  if (await discard.isVisible()) await discard.getByRole('button', { name: 'Descartar y salir' }).click();
  expect((await response).status()).toBe(204);
  // A click only dispatches the asynchronous logout. Do not navigate/reload until
  // the server confirms it and the interface has completed the session transition.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
}
for (const role of ['administrativo', 'docente', 'estudiante']) {
  test(`login, recarga y aislamiento de rutas: ${role}`, async ({ page }) => {
    const account = await login(page, role), path = role === 'administrativo' ? '/administracion' : '/academico';
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('.workspace-account').getByText(account.name, { exact: true })).toBeVisible();
    await page.reload(); await expect(page.locator('.workspace-account').getByText(account.name, { exact: true })).toBeVisible();
    await page.goto(path === '/administracion' ? '/academico' : '/administracion');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: role === 'administrativo' ? 'Inicio' : 'Malla curricular', exact: true })).toBeVisible();
    if (role !== 'administrativo') {
      const id = crypto.randomUUID(), detail = `/administracion/compras/${id}`;
      expect((await page.request.get(`/api/v1/purchases/${id}`)).status()).toBe(403);
      await page.goto(detail); await expect(page).toHaveURL(/\/academico$/);
    }
    if (role !== 'administrativo') await expect(page.getByRole('region', { name: 'Asignaturas por semestre' })).toBeVisible();
    else await expect(page.getByRole('link', { name: 'Ir a Compras', exact: true })).toBeVisible();
    await page.goto('/prototipo.html'); await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto('/compras'); await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto('/login'); await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}
test('sin sesión no muestra módulos y credenciales incorrectas no ingresan', async ({ page }) => {
  const id = crypto.randomUUID();
  expect((await page.request.get(`/api/v1/purchases/${id}`)).status()).toBe(401);
  await page.goto(`/administracion/compras/${id}`); await expect(page).toHaveURL(/\/login$/);
  await page.goto('/compras'); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Correo electrónico', { exact: true }).fill(credential('docente').email);
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
});
test('logout invalida cookie, atrás no restaura cuenta y permite otra identidad', async ({ page, context }) => {
  const account = await login(page, 'administrativo');
  // Leave a real protected document in history, rather than returning to about:blank.
  await page.goto('/administracion?prueba=historial');
  await expect(page.locator('.workspace-account').getByText(account.name, { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(c => c.name === 'cenit_session')!;
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const notice = page.getByRole('region', { name: /^Avisos/ }).getByRole('listitem').filter({ hasText: 'Saliste de Cenit' });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-x-position', 'right');
  await expect(notice).toHaveAttribute('data-y-position', 'bottom');
  await expect(notice).toHaveCSS('background-color', 'rgb(237, 245, 239)');
  await expect(page.locator('.cenit-access__feedback')).toBeEmpty();
  const response = await context.request.get('/api/v1/auth/session', { headers: { Cookie: `${cookie.name}=${cookie.value}` } });
  expect(response.status()).toBe(401);
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
  const second = await login(page, 'estudiante');
  await expect(page.locator('.workspace-account').getByText(second.name, { exact: true })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
test('expiración del reloj del navegador oculta cuenta y pide login', async ({ page }) => {
  await page.clock.install();
  const account = await login(page);
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('region', { name: /^Avisos/ }).getByText('Tu sesión expiró', { exact: true })).toBeVisible();
  const expired = page.getByRole('region', { name: /^Avisos/ }).getByRole('listitem').filter({ hasText: 'Tu sesión expiró' });
  await expect(expired).toHaveAttribute('data-x-position', 'right');
  await expect(expired).toHaveAttribute('data-y-position', 'bottom');
  await expect(expired).toHaveCSS('background-color', 'rgb(251, 247, 238)');
  await expect(page.locator('.cenit-access__feedback')).toBeEmpty();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
test('avisa cinco minutos antes, actualiza el tiempo y vence sin renovación', async ({ page }) => {
  await page.clock.install();
  await login(page, 'administrativo');
  await expect(page.getByRole('complementary', { name: 'Aviso de vencimiento de sesión' })).toHaveCount(0);
  await page.clock.fastForward(6901000);
  const warning = page.getByRole('complementary', { name: 'Aviso de vencimiento de sesión' });
  await expect(warning.getByRole('status')).toHaveText('Tu sesión vencerá en 5 minutos. Guarda tu trabajo antes de volver a iniciar sesión.');
  await expect(page).toHaveURL(/\/administracion$/);
  await page.clock.fastForward(240000);
  await expect(warning.getByRole('status')).toHaveText('Tu sesión vencerá en 1 minuto. Guarda tu trabajo antes de volver a iniciar sesión.');
  await page.clock.fastForward(60000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('region', { name: /^Avisos/ }).getByText('Tu sesión expiró', { exact: true })).toBeVisible();
});
test('el aviso permite cerrar la sesión antes del vencimiento', async ({ page }) => {
  await page.clock.install();
  await login(page, 'estudiante');
  await page.clock.fastForward(6901000);
  await page.getByRole('button', { name: 'Cerrar sesión ahora', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('region', { name: /^Avisos/ }).getByText('Saliste de Cenit', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/auth/session')).status()).toBe(401);
});
test('401 al revalidar oculta cuenta y avisa', async ({ page }) => {
  const account = await login(page);
  await page.route('**/api/v1/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.', requestId: 'test' } }) }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('region', { name: /^Avisos/ }).getByText('Tu sesión expiró', { exact: true })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
});
test('fallo de logout oculta contenido y permite reintentar sin falso éxito', async ({ page }) => {
  const account = await login(page);
  await page.route('**/api/v1/auth/logout', route => route.abort());
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo confirmar el cierre de sesión.');
  await expect(page.getByText('Saliste de Cenit', { exact: true })).toHaveCount(0);
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
  await page.getByLabel('Correo electrónico', { exact: true }).fill(credential('docente').email);
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

test('valida formato sin consultar API y rechaza correos que no son cuentas', async ({ page }) => {
  let loginRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/auth/login') loginRequests++; });
  await page.goto('/login');
  const email = page.getByLabel('Correo electrónico', { exact: true });
  const password = page.getByLabel('Contraseña', { exact: true });
  const submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveCount(2);
  await expect(email).toBeFocused();
  for (const malformed of ['sin-formato', 'docente@@cenit.invalid', 'docente@cenit']) {
    await email.fill(malformed); await password.fill('clave-ficticia'); await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Revisa el formato del correo electrónico.');
    await expect(password).toHaveValue('clave-ficticia');
  }
  expect(loginRequests).toBe(0);
  await email.fill('cuenta-inexistente@cenit.invalid'); await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Este espacio está en construcción.', { exact: true })).toHaveCount(0);
  expect(loginRequests).toBe(1);
});

test('normaliza sólo el correo y permite teclado y carga antes del éxito real', async ({ page, browserName }) => {
  const account = credential('docente');
  let release: (() => void) | undefined;
  let submitted: { email: string; password: string } | undefined;
  await page.route('**/api/v1/auth/login', async route => {
    submitted = route.request().postDataJSON();
    await new Promise<void>(resolve => { release = resolve; });
    await route.continue();
  });
  await page.goto('/login');
  const email = page.getByLabel('Correo electrónico', { exact: true });
  const password = page.getByLabel('Contraseña', { exact: true });
  await email.fill(`  ${account.email.toUpperCase().replace('@', ' @ ').replace('.', ' . ')}  `);
  await email.press('Tab');
  await expect(email).toHaveValue(account.email);
  await password.fill(account.password);
  await password.press('Tab');
  // macOS WebKit skips buttons in Tab navigation unless full keyboard access is enabled.
  if (browserName === 'webkit') await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'password');
  await page.keyboard.press('Tab');
  if (browserName === 'webkit') await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => Boolean(release)).toBe(true);
  expect(submitted?.email === account.email && submitted?.password === account.password).toBe(true);
  release!();
  await expect(page).toHaveURL(/\/academico$/);
  await expect(page.getByRole('heading', { name: 'Malla curricular', exact: true })).toBeFocused();
  await logout(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(password).toHaveValue('');
});

test('redimensionar con errores conserva el login sin cortes horizontales', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  for (const width of [1920, 1440, 1280, 1024, 1001, 1000]) {
    await page.setViewportSize({ width, height: 600 });
    await expect(page.getByRole('alert')).toHaveCount(2);
    const dimensions = await page.evaluate(() => {
      const form = document.querySelector('form')!.getBoundingClientRect();
      const root = document.documentElement;
      return { client: root.clientWidth, scroll: root.scrollWidth, left: form.left, right: form.right, form: form.width };
    });
    expect(dimensions.scroll, `overflow a ${width}px`).toBeLessThanOrEqual(dimensions.client);
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeLessThanOrEqual(dimensions.client);
    expect(dimensions.form).toBeLessThanOrEqual(336.5);
    await expect(page.locator('.cenit-access__landscape')).toBeVisible();
  }
});

test('normaliza visualmente espacios exteriores e interiores del correo repetidamente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const email = page.getByLabel('Correo electrónico', { exact: true });
  await email.fill('  DOC ENTE @ CENIT . INVALID  ');
  await email.press('Tab');
  await expect(email).toHaveValue('docente@cenit.invalid');
  // Compare the rendered text, excluding rounded borders/shadows whose antialiasing
  // can differ by a few pixels after native editing even when the text is unchanged.
  async function renderedEmail() {
    const bounds = await email.boundingBox();
    if (!bounds) throw new Error('El campo de correo no está visible.');
    return page.screenshot({ animations: 'disabled', caret: 'hide', clip: {
      x: bounds.x + 10, y: bounds.y + 8,
      width: bounds.width - 20, height: bounds.height - 16,
    } });
  }
  const normalizedAppearance = await renderedEmail();
  for (const edge of ['Home', 'End', 'Home', 'End']) {
    await email.press(edge);
    await email.pressSequentially('   ');
    await email.press('Tab');
    await expect(email).toHaveValue('docente@cenit.invalid');
    // Native email editing can show whitespace absent from input.value; check what is rendered too.
    await expect.poll(async () => Buffer.compare(normalizedAppearance, await renderedEmail())).toBe(0);
  }
  for (const whitespace of ['   ', '\u00a0']) {
    await email.press('Home');
    for (let position = 0; position < 3; position++) await email.press('ArrowRight');
    await email.pressSequentially(whitespace);
    await email.press('Tab');
    await expect(email).toHaveValue('docente@cenit.invalid');
    await expect.poll(async () => Buffer.compare(normalizedAppearance, await renderedEmail())).toBe(0);
  }
  // Enter submits without blur: the same normalization must also run on submission.
  await email.fill(' DOC ENTE @ CENIT . INVALID ');
  await email.press('Enter');
  await expect(email).toHaveValue('docente@cenit.invalid');
  await expect(page.getByRole('alert')).toHaveText('Escribe tu contraseña.');
});

test('espacios añadidos a una contraseña se conservan y no autentican como la clave original', async ({ page }) => {
  const account = credential('docente');
  let submittedPassword: string | undefined;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/v1/auth/login') submittedPassword = request.postDataJSON().password;
  });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  for (const candidate of [` ${account.password}`, `${account.password} `, `${account.password.slice(0, 3)} ${account.password.slice(3)}`]) {
    await page.getByLabel('Contraseña', { exact: true }).fill(candidate);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
    expect(submittedPassword === candidate).toBe(true);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toHaveCount(0);
  }
});


// Los campos de la fila se ubican por su id: su etiqueta lleva marcas («sugerido», «falta») que cambian con el contenido.
const recordField = (page: Page, key: string) => page.locator(`#purchase-record-${key}`);
async function manualForm(page: Page, number: string) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registrar a mano', exact: true })).toBeVisible();
  await recordField(page, 'requestNumber').fill(number);
  await recordField(page, 'description').fill('Solicitud ficticia de prueba');
  await recordField(page, 'totalAmount').fill('200000');
}

test('dashboard administrativo: cuatro enlaces, páginas aisladas y navegación directa', async ({ page }) => {
  await login(page, 'administrativo');
  const nav = page.getByRole('navigation', { name: 'Sistemas administrativos' });
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Demostración', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Prototipo con datos ficticios', { exact: true })).toHaveCount(0);
  const indicators = page.getByRole('definition');
  const summary = (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  const clp = (value: string) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(BigInt(value));
  await expect(indicators.nth(0)).toHaveText(clp(summary.overview.documentTotalThisYear));
  await expect(indicators.nth(1)).toHaveText(new RegExp(`^${summary.overview.registeredThisYear} ${summary.overview.registeredThisYear === 1 ? 'compra' : 'compras'}( · \\d+ proyectos?)?$`));
  await expect(indicators.nth(2)).toHaveText(clp(summary.overview.documentTotalThisMonth));
  // The monthly chart is drawn with bars and repeated as a table for assistive technology; a year without purchases says so instead.
  if (summary.overview.monthlyTotals.some((month: { amount: string }) => BigInt(month.amount) > 0n)) {
    await expect(page.getByRole('table', { name: 'Monto por mes' })).toHaveCount(1);
    await expect(page.locator('.home-chart__column')).toHaveCount(12);
  } else await expect(page.getByText(/^Aún no hay compras registradas en \d{4}\.$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /aprobar|validar/i })).toHaveCount(0);
  for (const width of [1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/admin-home-${width}.png` });
  }
  await navigateAdministration(page, 'Personal');
  await expect(page).toHaveURL(/\/administracion\/personal$/);
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Comisión de servicios/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Solicitud de permiso/ })).toBeVisible();
  await navigateAdministration(page, 'Bienes');
  await expect(page).toHaveURL(/\/administracion\/bienes$/);
  await expect(page.getByRole('heading', { name: 'Bienes', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('navigation', { name: 'Secciones de Bienes' })).toBeVisible();
  await navigateAdministration(page, 'Registro de compras');
  await expect(page.getByRole('heading', { name: 'Registro de compras', exact: true })).toBeVisible();
  // El laboratorio de ejemplos se retiró: su ruta vuelve al registro.
  await page.goto('/administracion/compras/laboratorio');
  await expect(page.getByLabel('Datos de ejemplo')).toHaveCount(0);
  await page.goto('/administracion/compras/nueva');
  await recordField(page, 'requestNumber').fill('navigation-draft');
  await navigateAdministration(page, 'Inicio');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/administracion$/);
  await page.goto('/administracion/compras/nueva');
  await expect(recordField(page, 'requestNumber')).toHaveValue('');
  await logout(page);
  await login(page, 'estudiante');
  for (const path of ['compras', 'personal', 'bienes']) {
    await page.goto(`/administracion/${path}`); await expect(page).toHaveURL(/\/academico$/);
    await expect(page.getByRole('navigation', { name: 'Sistemas administrativos' })).toHaveCount(0);
  }
});

test('registrar a mano: guardar y registrar otra, recarga, ficha y pago desde la fila', async ({ page }) => {
  const prefix = `E2E-${Date.now()}`;
  await manualForm(page, `${prefix}-1`);
  await recordField(page, 'provider').fill('Proveedor ficticio A');
  await page.getByRole('button', { name: 'Guardar y registrar otra', exact: true }).click();
  await expect(page.getByText('Compra guardada', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/compras\/nueva$/);
  await expect(recordField(page, 'requestNumber')).toHaveValue('');
  await expect(recordField(page, 'requestNumber')).toBeVisible();
  await recordField(page, 'requestNumber').fill(`${prefix}-2`);
  await recordField(page, 'description').fill('Segunda solicitud ficticia');
  await recordField(page, 'totalAmount').fill('150.000');
  await recordField(page, 'provider').fill('Proveedor ficticio A');
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(`Solicitud ${prefix}-2`);
  await page.reload();
  await expect(sheet).toContainText('Segunda solicitud ficticia');
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-sheet-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await sheet.getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByLabel('Buscar compras', { exact: true }).fill(prefix);
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await expect(list.getByText('2 registros', { exact: true })).toBeVisible();
  const pill = list.getByRole('button', { name: `Situación de pago de ${prefix}-1: pendiente. Marcar como pagado`, exact: true });
  await pill.click();
  await expect(list.getByRole('button', { name: `Situación de pago de ${prefix}-1: pagado. Volver a pendiente`, exact: true })).toBeVisible();
  await page.reload();
  await expect(list.getByRole('button', { name: `Situación de pago de ${prefix}-1: pagado. Volver a pendiente`, exact: true })).toBeVisible();
  await expect(list.getByRole('group', { name: 'Situación de pago', exact: true }).getByRole('button')).toHaveText(['Todas2', 'Pendientes1', 'Pagadas1']);
});

test('formulario manual: errores conservan datos, foco válido y navegación confirma descarte', async ({ page }) => {
  await manualForm(page, 'DRAFT-ERROR');
  await recordField(page, 'totalAmount').fill('200,5');
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(recordField(page, 'totalAmount')).toBeFocused();
  await expect(recordField(page, 'totalAmount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#purchase-record-totalAmount-error')).toBeVisible();
  await recordField(page, 'totalAmount').fill('200000');
  await page.route('**/api/v1/purchases', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'browser-test' } }) }));
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Tus datos siguen aquí');
  const focusResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/session'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await focusResponse;
  await expect(recordField(page, 'requestNumber')).toHaveValue('DRAFT-ERROR');
  await navigateAdministration(page, 'Inicio');
  const discard = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await expect(discard.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(discard).toHaveCount(0);
  await expect(page).toHaveURL(/\/compras\/nueva$/);
  await expect(page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true })).toBeFocused();
  await navigateAdministration(page, 'Inicio');
  await discard.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/administracion$/);
});

test('formulario manual: logout, cambio de cuenta y expiración descartan datos sin guardar', async ({ page }) => {
  // Exercise the transition with network latency, so an immediate navigation
  // cannot accidentally abort logout and retain the previous session cookie.
  await page.route('**/api/v1/auth/logout', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  await manualForm(page, 'PRIVATE-UNSAVED');
  await logout(page);
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'estudiante');
  await page.goto('/administracion/compras/nueva'); await expect(page).toHaveURL(/\/academico$/);
  await expect(page.getByText('PRIVATE-UNSAVED')).toHaveCount(0);
  await logout(page);
  await login(page, 'administrativo'); await page.goto('/administracion/compras/nueva');
  await expect(recordField(page, 'requestNumber')).toHaveValue('');
  await logout(page);
  await page.clock.install(); await manualForm(page, 'EXPIRED-UNSAVED');
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('EXPIRED-UNSAVED')).toHaveCount(0);
  await page.goBack(); await expect(page.getByText('EXPIRED-UNSAVED')).toHaveCount(0);
});

test('registrar a mano: montos inválidos se corrigen y el máximo exacto se guarda', async ({ page }) => {
  await manualForm(page, 'AMOUNT-DRAFT');
  // Un año sin otras compras: el monto de 255 dígitos no altera el Inicio que usan las demás pruebas.
  await recordField(page, 'recordDate').fill('01/01/2001');
  await recordField(page, 'totalAmount').fill('1,20');
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(recordField(page, 'totalAmount')).toBeFocused();
  await expect(recordField(page, 'totalAmount')).toHaveValue('1,20');
  const maximumAmount = '9'.repeat(255);
  await recordField(page, 'totalAmount').fill(maximumAmount);
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Solicitud AMOUNT-DRAFT');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const saved = (await (await page.request.get(`/api/v1/purchases/${new URL(page.url()).pathname.split('/').at(-1)}`)).json()).data;
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/administracion/compras?q=AMOUNT-DRAFT&allYears=1');
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await expect(list.getByText('1 registro', { exact: true })).toBeVisible();
  await expect(list.locator('.purchase-total strong')).toContainText('999.999');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.request.delete(`/api/v1/purchases/${saved.id}`, { headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: saved.version } })).status()).toBe(200);
});

test('listado: filtros por unidad y proyecto de la compra, totales, paginación y ficha', async ({ page }) => {
  test.setTimeout(90000);
  await login(page, 'administrativo');
  const origin = 'http://127.0.0.1:5174';
  const targets: string[] = [];
  for (const state of ['PENDIENTE', 'PAGADO']) {
    for (let index = 0; index < 21; index++) {
      const input = structuredClone(manualPurchaseExample); input.operationId = crypto.randomUUID();
      input.record.requestNumber = `HU06-${state}-${index}`;
      input.record.description = index === 0 ? 'Clínica HU06 100%_\\ literal' : 'HU06 base';
      input.record.recordDate = '2027-02-01'; input.record.totalAmount = index === 0 ? '300' : '100';
      input.record.unitCode = '990001'; input.record.projectCode = '99000001';
      const saved = await page.request.post('/api/v1/purchases', { headers: { origin }, data: input });
      expect(saved.status()).toBe(201); const record = (await saved.json()).data;
      if (index === 0) targets.push(input.record.requestNumber);
      if (state === 'PAGADO') expect((await page.request.post(`/api/v1/purchases/${record.id}/payment-situation`, { headers: { origin }, data: { expectedVersion: 1, paymentSituation: 'PAGADO' } })).status()).toBe(200);
    }
  }
  await page.goto('/administracion/compras?allYears=1');
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await list.getByRole('button', { name: 'Siguiente' }).click();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  const returnUrl = page.url();
  await list.getByRole('link', { name: /^Abrir la ficha de la compra/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(page).toHaveURL(returnUrl);
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  await page.reload();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  const search = page.getByLabel('Buscar compras', { exact: true });
  await search.fill('clinica hu06');
  await expect(page).toHaveURL(/q=clinica\+hu06/);
  await expect(list.getByText(/^Página 1 de /)).toBeVisible();
  await expect(list.getByText('2 registros', { exact: true })).toBeVisible();
  await expect(list.locator('.purchase-total strong')).toHaveText('$600');
  // Proyecto está en la barra; unidad, en «Más filtros». Un código escrito se aplica sin elegirlo de la lista.
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await page.getByLabel('Unidad', { exact: true }).fill('990001');
  await page.getByLabel('Proyecto', { exact: true }).fill('99000002');
  await expect(list.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
  await expect(list.getByRole('table')).toHaveCount(0);
  for (const width of [1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-empty-table-${width}.png`, fullPage: true });
  }
  await page.getByLabel('Proyecto', { exact: true }).fill('99000001');
  const datePicker = page.getByRole('textbox', { name: 'Rango de fechas: desde', exact: true });
  await page.getByRole('button', { name: 'Abrir calendario: rango de fechas', exact: true }).click();
  await selectRangeDay(page, '2027-02-01');
  await expect(page).toHaveURL(/dateFrom=2027-02-01&dateTo=2027-02-01/);
  // El calendario de filtros sigue abierto tras elegir; se cierra para no tapar las filas.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Calendario de rango de fechas' })).toHaveCount(0);
  await search.fill('100%_\\');
  await expect(page).toHaveURL(/q=100%25_%5C/);
  await expect(list.getByText('2 registros', { exact: true })).toBeVisible();
  await list.getByRole('group', { name: 'Situación de pago', exact: true }).getByRole('button', { name: /^Pagadas/ }).click();
  await expect(list.getByText('1 registro', { exact: true })).toBeVisible();
  for (const width of [1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-filters-${width}.png`, fullPage: true });
  }
  await list.getByRole('link', { name: /^Abrir la ficha de la compra/ }).click();
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}\?/);
  await expect(page.getByRole('dialog')).toContainText(`Solicitud ${targets[1]!}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(search).toHaveValue('100%_\\');
  await expect(datePicker).toHaveValue('01');
  await expect(page.getByRole('textbox', { name: 'Rango de fechas: desde, mes', exact: true })).toHaveValue('02');
  await expect(page.getByRole('textbox', { name: 'Rango de fechas: desde, año', exact: true })).toHaveValue('2027');
  await expect(page.getByLabel('Proyecto', { exact: true })).toHaveValue('99000001');
  await search.fill('no coincidence');
  await expect(list.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: /^Año:/ }).click();
  await page.getByRole('listbox', { name: 'Año', exact: true }).getByRole('option', { name: 'Todos los años', exact: true }).click();
  await expect(list.getByRole('row').nth(1)).toBeVisible();
});

test('listado: validación, error/reintento, carga y filtros descartados al cambiar sesión', async ({ page }) => {
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  const fixture = structuredClone(manualPurchaseExample); fixture.operationId = crypto.randomUUID();
  fixture.record.requestNumber = 'RETRY-' + crypto.randomUUID();
  fixture.record.recordDate = santiagoToday();
  expect((await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: fixture })).status()).toBe(201);
  const search = page.getByLabel('Buscar compras', { exact: true });
  await page.goto('/administracion/compras?dateFrom=2026-10-14&dateTo=2026-10-13');
  await expect(page.getByText('Corrige los filtros para consultar las compras.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/);
  await page.route('**/api/v1/purchases?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'filter-error' } }) }));
  const filteredFailure = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/purchases' && url.searchParams.get('q') === 'PRIVATE-FILTER' && response.status() === 503;
  });
  await search.fill('PRIVATE-FILTER');
  await expect(page).toHaveURL(/q=PRIVATE-FILTER/);
  await filteredFailure;
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await expect(list.getByRole('alert')).toContainText('No disponible');
  await expect(list.getByRole('table')).toHaveCount(0);
  await page.unroute('**/api/v1/purchases?**');
  await list.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(list.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/purchases?**', async route => { await hold; await route.continue(); });
  await search.fill('LOADING-FILTER');
  await expect(list.getByText('Actualizando resultados…', { exact: true })).toBeVisible();
  release();
  await expect(list.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(list.getByRole('table')).toBeVisible();
  await search.fill('PRIVATE-FILTER');
  await logout(page); await expect(page).toHaveURL(/\/login$/);
  await login(page, 'docente'); await page.goto('/administracion/compras'); await expect(page).toHaveURL(/\/academico$/);
  await logout(page);
  await login(page, 'administrativo'); await page.goto('/administracion/compras'); await expect(search).toHaveValue('');
  await page.clock.install(); await page.reload(); await expect(search).toBeVisible();
  await search.fill('EXPIRED-FILTER');
  await page.clock.fastForward(7201000); await expect(page).toHaveURL(/\/login$/);
  await page.clock.setSystemTime(new Date()); await page.goto('/administracion/compras'); await expect(search).toHaveValue('');
});

test('listado y formularios: páginas sin desbordamiento horizontal', async ({ page }) => {
  await login(page, 'administrativo');
  const prefix = `PAGE-${crypto.randomUUID().slice(0, 8)}`, recordDate = santiagoToday();
  const headers = { Origin: new URL(page.url()).origin };
  for (let index = 0; index < 22; index++) {
    const response = await page.request.post('/api/v1/purchases', { headers, data: { ...manualPurchaseExample, operationId: crypto.randomUUID(), record: { ...manualPurchaseExample.record, requestNumber: `${prefix}-${index}`, recordDate } } });
    expect(response.status()).toBe(201);
  }
  await page.goto(`/administracion/compras?q=${prefix}`);
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await list.getByRole('button', { name: 'Siguiente' }).click();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchases-list-${width}.png` });
  }
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  for (const width of [1280, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchases-form-${width}.png` });
  }
});
