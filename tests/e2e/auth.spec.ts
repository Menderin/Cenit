import { test, expect, type Page } from '@playwright/test';
import { credential, login } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

async function navigateAdministration(page: Page, name: string) {
  const navigation = page.getByRole('navigation', { name: 'Sistemas administrativos' });
  if (!await navigation.isVisible()) await page.getByRole('button', { name: 'Mostrar navegación', exact: true }).click();
  const link = navigation.getByRole('link', { name, exact: true });
  const path = await link.getAttribute('href');
  const changesPage = new URL(page.url()).pathname !== path;
  await link.click();
  if (changesPage) await expect.poll(async () => new URL(page.url()).pathname === path || await page.getByRole('alertdialog').isVisible()).toBe(true);
  if (changesPage && (page.viewportSize()?.width ?? 1280) <= 760 && !await page.getByRole('alertdialog').isVisible()) await expect(page.getByRole('button', { name: 'Mostrar navegación', exact: true })).toBeVisible();
}

async function expandPurchaseSection(page: Page, name: string) {
  const summary = page.locator('summary').filter({ hasText: name }).first();
  if (await summary.locator('..').getAttribute('open') === null) await summary.press('Enter');
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
    if (role !== 'administrativo') await expect(page.getByRole('region', { name: 'Asignaturas por semestre' })).toBeVisible();
    else await expect(page.getByRole('link', { name: 'Ver registros', exact: true })).toBeVisible();
    await page.goto('/prototipo.html'); await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto('/compras'); await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto('/login'); await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}
test('sin sesión no muestra módulos y credenciales incorrectas no ingresan', async ({ page }) => {
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
  await expect(page.locator('.cenit-notice').getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
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
  await expect(page.locator('.cenit-notice').getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
});
test('el aviso permite cerrar la sesión antes del vencimiento', async ({ page }) => {
  await page.clock.install();
  await login(page, 'estudiante');
  await page.clock.fastForward(6901000);
  await page.getByRole('button', { name: 'Cerrar sesión ahora', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.cenit-notice').getByRole('status')).toHaveText('Sesión cerrada.');
  expect((await page.request.get('/api/v1/auth/session')).status()).toBe(401);
});
test('401 al revalidar oculta cuenta y avisa', async ({ page }) => {
  const account = await login(page);
  await page.route('**/api/v1/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.', requestId: 'test' } }) }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.cenit-notice').getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
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
  for (const width of [1920, 1440, 1280, 1024, 1001, 1000, 768, 761, 760, 390, 320]) {
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
    if (width > 760) await expect(page.locator('.cenit-access__landscape')).toBeVisible();
    else await expect(page.locator('.cenit-access__landscape')).toBeHidden();
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


async function openPurchases(page: Page) {
  await login(page, 'administrativo');
  await navigateAdministration(page, 'Registro de compras');
  await expect(page).toHaveURL(/\/administracion\/compras$/);
  await expect(page.getByRole('link', { name: 'Revisar ejemplo' })).toHaveCount(0);
  await page.goto('/administracion/compras/laboratorio');
}

test('contrato de compras: revisar ejemplos, corregir sin alterar original y restablecer', async ({ page }) => {
  await openPurchases(page);
  await expect(page.locator('.purchase-origin-badge')).toHaveText('Ejemplo de demostración');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  const number = page.getByLabel('Nº Documento / solicitud', { exact: true });
  await expect(number).toHaveValue('000125');
  await number.fill('000999');
  const field = number.locator('..');
  await expect(field).toContainText('Corregido');
  await field.locator('summary').press('Enter');
  await expect(field.locator('details dd').first()).toHaveText('000125');
  await expandPurchaseSection(page, 'Seguimiento administrativo');
  await page.getByLabel('BI', { exact: true }).fill('S/N');
  await page.getByLabel('Monto total (CLP)', { exact: true }).fill('200.000');
  await page.getByRole('button', { name: 'Comprobar datos' }).click();
  await expect(page.getByRole('alert')).toContainText('Revisa los campos indicados.');
  await page.getByLabel('Monto total (CLP)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Comprobar datos' }).click();
  await expect(page.getByRole('status')).toContainText('Formatos correctos.');
  await page.getByRole('button', { name: 'Restablecer ejemplo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar y restablecer' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(number).toHaveValue('000125');
  await expect(page.getByLabel('BI', { exact: true })).toHaveValue('');
  await page.getByLabel('Datos de ejemplo').selectOption('partial');
  await expandPurchaseSection(page, 'Ítem 1');
  await expect(page.getByRole('group', { name: 'Ítem de la solicitud 1', exact: true }).getByLabel('Proveedor', { exact: true })).toHaveValue('');
  await page.getByLabel('Datos de ejemplo').selectOption('ambiguous');
  await page.locator('.purchase-review__issues > summary').press('Enter');
  await expect(page.locator('.purchase-review__issues')).toContainText('no se puede determinar');
  await page.getByLabel('Datos de ejemplo').selectOption('failure');
  await expect(page.getByRole('alert')).toContainText('Selecciona otro ejemplo para continuar.');
  await expect(page.getByRole('button', { name: 'Comprobar datos' })).toHaveCount(0);
  await page.getByLabel('Datos de ejemplo').selectOption('recovered');
  await expect(number).toHaveValue('000125');
});

test('compras: logout y cambio de cuenta limpian el borrador', async ({ page }) => {
  // Exercise the transition with network latency, so an immediate navigation
  // cannot accidentally abort logout and retain the previous session cookie.
  await page.route('**/api/v1/auth/logout', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  await openPurchases(page);
  await page.getByLabel('Nº Documento / solicitud', { exact: true }).fill('private-draft');
  await logout(page);
  await login(page, 'docente');
  await page.goto('/administracion'); await expect(page).toHaveURL(/\/academico$/);
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveCount(0);

  await logout(page);
  await openPurchases(page);
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveValue('000125');
  await expect(page.getByText('private-draft')).toHaveCount(0);
});

test('compras: expiración descarta borrador y protege la navegación hacia atrás', async ({ page }) => {
  await page.clock.install(); await openPurchases(page);
  await page.getByLabel('Nº Documento / solicitud', { exact: true }).fill('expired-draft');
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveCount(0);
  await page.goBack(); await expect(page.getByText('expired-draft')).toHaveCount(0);
  // Browser-only expiry does not revoke the server cookie. Revalidate it at real time;
  // even a still-valid server session must not resurrect the discarded draft.
  await page.clock.setSystemTime(new Date());
  await page.goto('/administracion/compras/laboratorio');
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveValue('000125');
});


test('compras: formulario accesible y sin desbordamiento en escritorio y móvil', async ({ page }) => {
  await openPurchases(page);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Revisar datos', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const number = page.getByLabel('Nº Documento / solicitud', { exact: true });
    await number.focus(); await expect(number).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(number.locator('..').locator('summary')).toBeFocused();
    // QA artifacts contain only the fictitious logged-in example, never credentials.
    await page.screenshot({ path: `tmp/purchase-review-${width}.png` });
  }
});


test('dashboard administrativo: cuatro enlaces, páginas aisladas y navegación directa', async ({ page }) => {
  await login(page, 'administrativo');
  const nav = page.getByRole('navigation', { name: 'Sistemas administrativos' });
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Demostración', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Prototipo con datos ficticios', { exact: true })).toHaveCount(0);
  const indicators = page.getByRole('definition');
  const summary = (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  await expect(indicators.nth(0)).toHaveText(String(summary.overview.registeredThisYear));
  await expect(indicators.nth(2)).toHaveText(String(summary.overview.registeredThisMonth));
  await expect(indicators.nth(4)).toHaveText(new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(BigInt(summary.overview.documentTotalThisMonth)));
  await expect(page.getByRole('table')).toHaveCount(0);
  const chart = page.getByRole('list', { name: 'Detalle de compras incorporadas por día' });
  await expect(chart.getByRole('listitem')).toHaveCount(30);
  await expect(page.getByRole('button', { name: /aprobar/i })).toHaveCount(0);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/admin-home-${width}.png` });
  }
  for (const [name, path] of [['Sistema de personal', 'personal'], ['Sistema de bienes', 'bienes']] as const) {
    await navigateAdministration(page, name);
    await expect(page).toHaveURL(new RegExp(`/administracion/${path}$`));
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText('En preparación', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await navigateAdministration(page, 'Registro de compras');
  await expect(page.getByRole('link', { name: 'Revisar ejemplo' })).toHaveCount(0);
  await page.goto('/administracion/compras/laboratorio');
  await page.getByLabel('Nº Documento / solicitud', { exact: true }).fill('navigation-draft');
  await navigateAdministration(page, 'Inicio');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/administracion$/);
  await expect(page.getByRole('button', { name: 'Mostrar navegación', exact: true })).toBeVisible();
  await navigateAdministration(page, 'Registro de compras');
  await expect(page.getByRole('link', { name: 'Revisar ejemplo' })).toHaveCount(0);
  await page.goto('/administracion/compras/laboratorio');
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveValue('000125');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Revisar datos', exact: true })).toBeVisible();
  await logout(page);
  await login(page, 'estudiante');
  for (const path of ['compras', 'personal', 'bienes']) {
    await page.goto(`/administracion/${path}`); await expect(page).toHaveURL(/\/academico$/);
    await expect(page.getByRole('navigation', { name: 'Sistemas administrativos' })).toHaveCount(0);
  }
});

async function manualForm(page: Page, number: string) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Registrar manualmente' }).click();
  await page.getByLabel('Nº Documento / solicitud *', { exact: true }).fill(number);
  await page.getByLabel('Fecha de envío *', { exact: true }).fill('13/10/2026');
  await page.getByLabel('Descripción *', { exact: true }).fill('Solicitud ficticia de prueba');
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill('200000');
}

test('solicitudes persistentes: ingreso, varios ítems, recarga, detalle y validación local', async ({ page }) => {
  const number = `E2E-${Date.now()}`;
  await manualForm(page, number);
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Descripción · ítem 1', { exact: true }).fill('Primer servicio');
  await page.getByLabel('Proveedor · ítem 1', { exact: true }).fill('Proveedor ficticio A');
  await page.getByLabel('Importe (CLP) · ítem 1', { exact: true }).fill('100000');
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Proveedor · ítem 2', { exact: true }).fill('Proveedor ficticio B');
  await page.getByLabel('Código proyecto · ítem 2', { exact: true }).fill('0000000');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Solicitud / })).toBeVisible();
  await expect(page.getByText(number, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.purchase-item__provider').filter({ hasText: 'Proveedor ficticio B' })).toBeVisible();
  await expandPurchaseSection(page, 'Ítem 2');
  await expect(page.locator('.purchase-detail-fields dd').filter({ hasText: 'Proveedor ficticio B' })).toHaveText('Proveedor ficticio B');
  await expect(page.getByText('0000000', { exact: true })).toBeVisible();
  for (const width of [1280, 1440, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `tmp/purchase-detail-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Volver al registro' }).click();
  const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  const row = pending.getByRole('row').filter({ hasText: number });
  await expect(row.getByText('Sin dato', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('La revisión de los datos quedará registrada en Cenit.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Validar registro' }).click();
  await expect(row).toHaveCount(0);
  const reviewed = page.getByRole('region', { name: 'Revisados en Cenit', exact: true });
  const reviewedRow = reviewed.getByRole('row').filter({ hasText: number });
  await expect(reviewedRow).toHaveCount(1); await expect(reviewedRow.getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(0);
  await expect(reviewedRow.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0);
  await reviewedRow.getByRole('link', { name: 'Ver detalles' }).click();
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
  await expect(page.getByText(/Revisado en Cenit por/)).toBeVisible();
  await page.reload(); await expect(page.getByText('Revisado en Cenit', { exact: true })).toBeVisible();
});

test('formulario manual: errores conservan datos, foco válido y navegación confirma descarte', async ({ page }) => {
  await manualForm(page, 'DRAFT-ERROR');
  await page.getByLabel('Fecha de envío *', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByLabel('Fecha de envío *', { exact: true })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Fecha de envío');
  await page.getByLabel('Fecha de envío *', { exact: true }).fill('13/10/2026');
  await page.route('**/api/v1/purchases', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'browser-test' } }) }));
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  const focusResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/session'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await focusResponse;
  await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue('DRAFT-ERROR');
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
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('formulario manual: logout y expiración descartan datos sin guardar', async ({ page }) => {
  await manualForm(page, 'PRIVATE-UNSAVED');
  await logout(page);
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'estudiante');
  await page.goto('/administracion/compras/nueva'); await expect(page).toHaveURL(/\/academico$/);
  await expect(page.getByText('PRIVATE-UNSAVED')).toHaveCount(0);
  await logout(page);
  await page.clock.install(); await manualForm(page, 'EXPIRED-UNSAVED');
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('EXPIRED-UNSAVED')).toHaveCount(0);
});

test('laboratorio: transferir correcciones no guarda, y el reintento conserva operación y origen', async ({ page }) => {
  await openPurchases(page);
  await page.getByLabel('Datos de ejemplo').selectOption('ambiguous');
  const number = `EXAMPLE-${Date.now()}`;
  await page.getByLabel('Nº Documento / solicitud', { exact: true }).fill(number);
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción', { exact: true }).fill('Descripción revisada de ejemplo ficticio');
  await page.getByRole('button', { name: 'Continuar al formulario' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar compra' })).toBeVisible();
  await expect(page.locator('.purchase-origin-badge')).toHaveText('Ejemplo de demostración · Por aclarar');
  await expect(page.getByLabel('Monto total (CLP) *', { exact: true })).toHaveValue('');
  const list = await page.request.get('/api/v1/purchases?reviewStatus=pending&pageSize=100');
  expect((await list.json()).data.some((row: { requestNumber: string }) => row.requestNumber === number)).toBe(false);
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByText('Completa o corrige los campos indicados.')).toBeVisible();
  await page.getByLabel('Fecha de envío *', { exact: true }).fill('01/01/' + new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric' }).format(new Date()));
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill('200000');
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/api/v1/purchases', async route => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'example-retry' } }) });
  });
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  await expect(page.getByLabel('Descripción *', { exact: true })).toHaveValue('Descripción revisada de ejemplo ficticio');
  await page.unroute('**/api/v1/purchases');
  const retry = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/api/v1/purchases'));
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  expect((await retry).postDataJSON()).toEqual(attempts[0]);
  expect(attempts[0]!.origin).toEqual({ type: 'contract_example', exampleId: 'ambiguous' });
  await expect(page.getByRole('heading', { name: /^Solicitud / })).toBeVisible();
  await expect(page.locator('.purchase-origin-badge')).toHaveText('Ejemplo de demostración · Por aclarar');
  await page.reload(); await expect(page.getByText(number, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al registro' }).click();
  const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  const row = pending.getByRole('row').filter({ hasText: number });
  await expect(row.getByText('Ejemplo de demostración', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Validar registro' }).click();
  const reviewed = page.getByRole('region', { name: 'Revisados en Cenit', exact: true }).getByRole('row').filter({ hasText: number });
  await expect(reviewed.getByText('Ejemplo de demostración', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Registrar manualmente' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar compra' })).toBeVisible();
  await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue('');
});

test('laboratorio: formato inválido bloquea transferencia, original intacto y borrador aislado por sesión', async ({ page }) => {
  await page.clock.install();
  await openPurchases(page);
  await page.getByLabel('Monto total (CLP)', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Continuar al formulario' }).click();
  await expect(page).toHaveURL(/\/laboratorio$/);
  await expect(page.getByRole('alert')).toContainText('Revisa los campos indicados.');
  await page.getByRole('button', { name: 'Restablecer ejemplo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar y restablecer' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByLabel('Monto total (CLP)', { exact: true })).toHaveValue('200000');
  await page.getByLabel('Datos de ejemplo').selectOption('failure');
  await expect(page.getByRole('button', { name: 'Continuar al formulario' })).toHaveCount(0);
  await page.getByLabel('Datos de ejemplo').selectOption('partial');
  await page.getByLabel('Nº Documento / solicitud', { exact: true }).fill('PRIVATE-TRANSFER');
  await page.getByRole('button', { name: 'Continuar al formulario' }).click();
  await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue('PRIVATE-TRANSFER');
  await logout(page);
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'docente'); await page.goto('/administracion/compras/nueva');
  await expect(page).toHaveURL(/\/academico$/); await expect(page.getByText('PRIVATE-TRANSFER')).toHaveCount(0);
  await logout(page);
  await login(page, 'administrativo'); await page.goto('/administracion/compras/nueva');
  await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue('');
  await page.goto('/administracion/compras/laboratorio');
  await page.getByRole('button', { name: 'Continuar al formulario' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar compra' })).toBeVisible();
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Registrar compra')).toHaveCount(0);
  await page.clock.setSystemTime(new Date()); await page.goto('/administracion/compras/nueva');
  await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue('');
});

test('listado: filtros comunes, códigos del mismo ítem, totales, paginación y detalle', async ({ page }) => {
  await login(page, 'administrativo');
  const origin = 'http://127.0.0.1:5174';
  const targets: string[] = [];
  for (const state of ['pending', 'reviewed']) {
    for (let index = 0; index < 21; index++) {
      const input = structuredClone(manualPurchaseExample); input.operationId = crypto.randomUUID();
      input.header.requestNumber = `HU06-${state}-${index}`;
      input.header.description = index === 0 ? 'Clínica HU06 100%_\\ literal' : 'HU06 base';
      input.header.sentDate = '2027-02-01'; input.header.totalAmount = index === 0 ? '300' : '100';
      input.lines[0]!.unitCode = '000A'; input.lines[0]!.projectCode = '000X';
      input.lines[1]!.unitCode = '000B'; input.lines[1]!.projectCode = '000Y';
      const saved = await page.request.post('/api/v1/purchases', { headers: { origin }, data: input });
      expect(saved.status()).toBe(201); const record = (await saved.json()).data;
      if (index === 0) targets.push(input.header.requestNumber);
      if (state === 'reviewed') expect((await page.request.post(`/api/v1/purchases/${record.id}/validation`, { headers: { origin }, data: { expectedVersion: 1 } })).status()).toBe(200);
    }
  }
  await page.goto('/administracion/compras?allYears=1');
  const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  const reviewed = page.getByRole('region', { name: 'Revisados en Cenit', exact: true });
  await pending.getByRole('button', { name: 'Siguiente' }).click();
  await reviewed.getByRole('button', { name: 'Siguiente' }).click();
  await expect(pending.getByText(/^Página 2 de /)).toBeVisible();
  await expect(reviewed.getByText(/^Página 2 de /)).toBeVisible();
  const returnUrl = page.url();
  await pending.getByRole('link', { name: 'Ver detalles' }).first().click();
  await page.getByRole('link', { name: 'Volver al registro' }).click();
  await expect(page).toHaveURL(returnUrl);
  await expect(pending.getByText(/^Página 2 de /)).toBeVisible();
  await expect(reviewed.getByText(/^Página 2 de /)).toBeVisible();
  await page.reload();
  await expect(pending.getByText(/^Página 2 de /)).toBeVisible();
  await expect(reviewed.getByText(/^Página 2 de /)).toBeVisible();
  const search = page.getByLabel('Buscar solicitudes', { exact: true });
  await search.fill('clinica hu06');
  await expect(page).toHaveURL(/q=clinica\+hu06/);
  for (const table of [pending, reviewed]) {
    await expect(table.getByText(/^Página 1 de /)).toBeVisible();
    await expect(table.getByText('1 registro', { exact: true })).toBeVisible();
    await expect(table.locator('.purchase-total strong')).toHaveText('$300');
  }
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await page.getByLabel('Código de unidad', { exact: true }).fill('000A');
  await page.getByLabel('Código de proyecto', { exact: true }).fill('000Y');

  for (const table of [pending, reviewed]) {
    await expect(table.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
    await expect(table.getByRole('table')).toHaveCount(0);
  }
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-empty-tables-${width}.png`, fullPage: true });
  }
  await page.getByLabel('Código de proyecto', { exact: true }).fill('000X');
  const datePicker = page.getByLabel('Fecha de envío', { exact: true });
  await page.getByRole('button', { name: 'Abrir calendario: Fecha de envío', exact: true }).click();
  for (let month = 0; month < 4; month++) await page.locator('.cenit-calendar .rdp-button_next').click();
  await page.locator('.cenit-calendar [data-day="2027-02-01"] .rdp-day_button').click();
  await expect(page).toHaveURL(/dateFrom=2027-02-01&dateTo=2027-02-01/);
  await search.fill('100%_\\');
  for (const table of [pending, reviewed]) await expect(table.getByText('1 registro', { exact: true })).toBeVisible();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-filters-${width}.png`, fullPage: true });
  }
  await pending.getByRole('link', { name: 'Ver detalles' }).click();
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}$/);
  await expect(page.getByText(targets[0]!, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al registro' }).click();
  await expect(search).toHaveValue('100%_\\');
  await expect(datePicker).toHaveValue('01');
  await expect(page.getByLabel('Fecha de envío, mes', { exact: true })).toHaveValue('02');
  await expect(page.getByLabel('Fecha de envío, año', { exact: true })).toHaveValue('2027');
  await expect(page.getByLabel('Código de proyecto', { exact: true })).toHaveValue('000X');
  await search.fill('no coincidence');
  await expect(pending.getByText('0 registros', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: /^Año de envío:/ }).click();
  await page.getByRole('listbox', { name: 'Año de envío', exact: true }).getByRole('option', { name: 'Todos los años', exact: true }).click();
  await expect(pending.getByRole('row').nth(1)).toBeVisible();
});

test('listado: validación, error/reintento, carga y filtros descartados al cambiar sesión', async ({ page }) => {
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  const fixture = structuredClone(manualPurchaseExample); fixture.operationId = crypto.randomUUID();
  fixture.header.requestNumber = 'RETRY-' + crypto.randomUUID();
  fixture.header.sentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  expect((await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: fixture })).status()).toBe(201);
  const search = page.getByLabel('Buscar solicitudes', { exact: true });
  await page.goto('/administracion/compras?dateFrom=2026-10-14&dateTo=2026-10-13');
  await expect(page.getByText('Corrige los filtros para consultar las compras.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/);
  await page.route('**/api/v1/purchases?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'filter-error' } }) }));
  await search.fill('PRIVATE-FILTER');
  const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  await expect(pending.getByRole('alert')).toContainText('No disponible');
  await expect(pending.getByRole('table')).toHaveCount(0);
  await page.unroute('**/api/v1/purchases?**');
  await pending.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(pending.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/purchases?**', async route => { await hold; await route.continue(); });
  await search.fill('LOADING-FILTER');

  await expect(pending.getByText('Actualizando resultados…', { exact: true })).toBeVisible();
  release();
  await expect(pending.getByText('No encontramos compras con estos filtros', { exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(pending.getByRole('table')).toBeVisible();
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

test('solicitudes: paginación independiente y vistas sin desbordamiento horizontal', async ({ page }) => {
  await login(page, 'administrativo');
  for (let index = 0; index < 21; index++) {
    const response = await page.request.post('/api/v1/purchases', { headers: { origin: 'http://127.0.0.1:5174' }, data: { ...manualPurchaseExample, operationId: crypto.randomUUID(), header: { ...manualPurchaseExample.header, requestNumber: `PAGE-${index}` } } });
    expect(response.status()).toBe(201);
  }
  await page.goto('/administracion/compras');
  const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  const reviewed = page.getByRole('region', { name: 'Revisados en Cenit', exact: true });
  await pending.getByRole('button', { name: 'Siguiente' }).click();
  await expect(pending.getByText(/^Página 2 de /)).toBeVisible();
  await expect(reviewed.getByText(/^Página 1 de /)).toBeVisible();
  for (const width of [1280, 1440, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchases-list-${width}.png` });
  }
  await page.getByRole('link', { name: 'Registrar manualmente' }).click();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchases-form-${width}.png` });
  }
});

test('ítems desplegables: errores abren el ítem y eliminar otro conserva valores y apertura', async ({ page }) => {
  await manualForm(page, 'DISCLOSURE-DRAFT');
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  const items = page.locator('fieldset details.purchase-item');
  const amount = page.getByLabel('Importe (CLP) · ítem 1', { exact: true });
  await amount.fill('1,20');
  await items.nth(0).locator('summary').click();
  await expect(items.nth(0)).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(items.nth(0)).toHaveAttribute('open');
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue('1,20');
  await amount.fill('100000');
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Descripción · ítem 2', { exact: true }).fill('Ítem que se conserva');
  await page.getByLabel('Proveedor · ítem 2', { exact: true }).fill('Proveedor conservado');
  await items.nth(1).locator('summary').click();
  await page.getByRole('button', { name: 'Eliminar ítem 1', exact: true }).click();
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).not.toHaveAttribute('open');
  await items.nth(0).locator('summary').click();
  await expect(page.getByLabel('Descripción · ítem 1', { exact: true })).toHaveValue('Ítem que se conserva');
  await expect(page.getByLabel('Proveedor · ítem 1', { exact: true })).toHaveValue('Proveedor conservado');
  const maximumAmount = '9'.repeat(255);
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill(maximumAmount);
  await page.getByLabel('Importe (CLP) · ítem 1', { exact: true }).fill(maximumAmount);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Solicitud / })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('DISCLOSURE-DRAFT');

  const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  await expect(pending.getByText('1 registro', { exact: true })).toBeVisible();
  await expect(pending.locator('.purchase-total strong')).toContainText('999.999');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
