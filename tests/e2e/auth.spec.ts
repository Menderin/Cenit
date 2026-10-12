import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { DemoCredentials } from '../../db/seeds/auth-demo.js';

const credential = (role: string) => (JSON.parse(readFileSync('tmp/e2e-auth/credentials.json', 'utf8')) as DemoCredentials).find(c => c.role === role)!;
async function login(page: Page, role = 'docente') {
  const account = credential(role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  return account;
}
for (const role of ['administrativo', 'docente', 'estudiante']) {
  test(`login, recarga y aislamiento de rutas: ${role}`, async ({ page }) => {
    const account = await login(page, role), path = role === 'administrativo' ? '/administracion' : '/academico';
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText(account.name, { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText(account.name, { exact: true })).toBeVisible();
    await page.goto(path === '/administracion' ? '/academico' : '/administracion');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: role === 'administrativo' ? 'Administración' : 'Área académica', exact: true })).toBeVisible();
    await expect(page.getByText('Este espacio está en construcción.', { exact: true })).toBeVisible();
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
  await expect(page).toHaveURL(/\/administracion$/);
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

test('normaliza sólo el correo y permite teclado y carga antes del éxito real', async ({ page }) => {
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
  await password.press('Tab'); await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'password');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => Boolean(release)).toBe(true);
  expect(submitted?.email === account.email && submitted?.password === account.password).toBe(true);
  release!();
  await expect(page).toHaveURL(/\/academico$/);
  await expect(page.getByRole('heading', { name: 'Área académica', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
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
  await page.goto('/login');
  const email = page.getByLabel('Correo electrónico', { exact: true });
  await email.fill('  DOC ENTE @ CENIT . INVALID  ');
  await email.press('Tab');
  await expect(email).toHaveValue('docente@cenit.invalid');
  // Finish focus transitions so captures compare the final field, not animation timing.
  const normalizedAppearance = await email.screenshot({ animations: 'disabled' });
  for (const edge of ['Home', 'End', 'Home', 'End']) {
    await email.press(edge);
    await email.pressSequentially('   ');
    await email.press('Tab');
    await expect(email).toHaveValue('docente@cenit.invalid');
    // Native email editing can show whitespace absent from input.value; check what is rendered too.
    expect(Buffer.compare(normalizedAppearance, await email.screenshot({ animations: 'disabled' }))).toBe(0);
  }
  for (const whitespace of ['   ', '\u00a0']) {
    await email.press('Home');
    for (let position = 0; position < 3; position++) await email.press('ArrowRight');
    await email.pressSequentially(whitespace);
    await email.press('Tab');
    await expect(email).toHaveValue('docente@cenit.invalid');
    expect(Buffer.compare(normalizedAppearance, await email.screenshot({ animations: 'disabled' }))).toBe(0);
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
