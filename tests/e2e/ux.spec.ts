import { test, expect, type Page } from '@playwright/test';
import { credential, login } from './support/browser.js';

async function newForm(page: Page) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Nueva solicitud', exact: true }).click();
}
const number = (page: Page) => page.getByLabel('Nº Documento / solicitud *', { exact: true });
const date = (page: Page) => page.getByLabel('Fecha de envío *', { exact: true });
async function complete(page: Page, value: string) {
  await number(page).fill(value);
  await date(page).fill('29/02/2028');
  await page.getByLabel('Descripción *', { exact: true }).fill('Solicitud ficticia para verificar interacción');
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill('200000');
}
async function loseSessionCheck(page: Page) {
  await page.route('**/api/v1/auth/session', route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toHaveText('No se pudo comprobar la sesión. Intenta nuevamente.');
  await expect(number(page)).toHaveCount(0);
}

test('cancelar distingue vacío, cambios revertidos e ítems, sin enviar compras', async ({ page }) => {
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/purchases') posts++; });
  await newForm(page);
  await expect(page.getByText('Borrador sin guardar', { exact: true })).toHaveCount(0);
  await number(page).fill('Revertido'); await number(page).fill('');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Nueva solicitud', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancelar', exact: true });
  await cancel.click();
  const dialog = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await expect(dialog.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(cancel).toBeFocused();
  await expect(page.getByRole('button', { name: 'Eliminar ítem 1' })).toBeVisible();
  await cancel.click(); await dialog.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/compras$/);
  await page.getByRole('link', { name: 'Nueva solicitud', exact: true }).click();
  await expect(page.getByText('Borrador sin guardar', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Eliminar ítem 1' })).toHaveCount(0);
  expect(posts).toBe(0);
});

test('atrás y logout conservan el borrador si se cancela el descarte', async ({ page }) => {
  await newForm(page); await number(page).fill('Conservar');
  await page.goBack();
  const dialog = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await dialog.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(number(page)).toHaveValue('Conservar');
  let logoutRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/auth/logout')) logoutRequests++; });
  const logout = page.getByRole('button', { name: 'Cerrar sesión', exact: true });
  await logout.click(); await page.keyboard.press('Escape');
  await expect(logout).toBeFocused(); await expect(number(page)).toHaveValue('Conservar');
  expect(logoutRequests).toBe(0);
  await logout.click(); await dialog.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.cenit-notice')).toContainText('Saliste de Cenit');
  await expect(page.locator('.cenit-notice').getByRole('status')).toHaveText('Sesión cerrada.');
});

test('revisión confirma restablecer y cambiar ejemplo, Escape recupera control y correcciones', async ({ page }) => {
  await login(page, 'administrativo'); await page.goto('/administracion/compras/laboratorio');
  const field = page.getByLabel('Nº Documento / solicitud', { exact: true });
  await field.fill('CORRECCION');
  const reset = page.getByRole('button', { name: 'Restablecer ejemplo' });
  await reset.click(); await page.keyboard.press('Escape');
  await expect(reset).toBeFocused(); await expect(field).toHaveValue('CORRECCION');
  const examples = page.getByLabel('Datos de ejemplo');
  await examples.focus();
  await examples.selectOption('partial');
  const dialog = page.getByRole('alertdialog', { name: 'Cambiar ejemplo' });
  await page.keyboard.press('Escape'); await expect(examples).toBeFocused();
  await expect(examples).toHaveValue('recovered'); await expect(field).toHaveValue('CORRECCION');
  await examples.selectOption('partial');
  await dialog.getByRole('button', { name: 'Descartar y cambiar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(examples).toHaveValue('partial');
  await field.fill('Otra corrección'); await reset.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar y restablecer' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(field).not.toHaveValue('Otra corrección');
});

test('fallo temporal oculta y recupera misma cuenta, origen, ítems y operación original', async ({ page }) => {
  await login(page, 'administrativo'); await page.goto('/administracion/compras/laboratorio');
  await page.getByLabel('Datos de ejemplo').selectOption('partial');
  await page.getByLabel('Nº Documento / solicitud', { exact: true }).fill('REVISION-RECUPERADA');
  await loseSessionCheck(page);
  await page.unroute('**/api/v1/auth/session'); await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByLabel('Datos de ejemplo')).toHaveValue('partial');
  await expect(page.getByLabel('Nº Documento / solicitud', { exact: true })).toHaveValue('REVISION-RECUPERADA');
  await page.getByRole('button', { name: 'Continuar al formulario' }).click();
  await complete(page, `RECUPERADA-${Date.now()}`);
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Proveedor · ítem 3', { exact: true }).fill('Proveedor ficticio conservado');
  const attempts: unknown[] = [];
  await page.route('**/api/v1/purchases', async route => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'ux-test' } }) });
  });
  await page.getByRole('button', { name: 'Guardar solicitud' }).click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  await loseSessionCheck(page);
  await page.unroute('**/api/v1/auth/session'); await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('.purchase-origin-badge')).toContainText('Ejemplo de demostración');
  const item = page.locator('details').filter({ has: page.getByLabel('Proveedor · ítem 3', { exact: true }) }).first();
  await item.locator('summary').click();
  await expect(page.getByLabel('Proveedor · ítem 3', { exact: true })).toHaveValue('Proveedor ficticio conservado');
  await page.getByRole('button', { name: 'Guardar solicitud' }).click();
  await expect.poll(() => attempts.length).toBe(2); expect(attempts[1]).toEqual(attempts[0]);
});

test('el borrador oculto vence y no se entrega a otra cuenta', async ({ page }) => {
  await page.clock.install(); await newForm(page); await number(page).fill('PRIVADO');
  await loseSessionCheck(page);
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.cenit-notice')).toContainText('Vuelve a iniciar sesión');
  await page.clock.setSystemTime(new Date()); await page.unroute('**/api/v1/auth/session');
  await page.goto('/administracion/compras/nueva'); await expect(number(page)).toHaveValue('');
  await number(page).fill('OTRA-IDENTIDAD'); await loseSessionCheck(page);
  const other = credential('docente');
  const response = await page.request.post('/api/v1/auth/login', { data: { email: other.email, password: other.password }, headers: { Origin: new URL(page.url()).origin } });
  expect(response.status()).toBe(200);
  await page.unroute('**/api/v1/auth/session'); await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page).toHaveURL(/\/academico$/); await expect(number(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); await newForm(page);
  await expect(number(page)).toHaveValue('');
});

test('calendario en español funciona por teclado, valida bisiesto y envía fecha civil', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await newForm(page); await complete(page, 'FECHA-CIVIL');
  await date(page).fill('29/02/2027');
  await page.getByRole('button', { name: 'Guardar solicitud' }).click();
  await expect(date(page)).toBeFocused(); await expect(date(page)).toHaveAttribute('aria-invalid', 'true');
  await date(page).fill('29/02/2028');
  const trigger = page.getByRole('button', { name: 'Abrir calendario: Fecha de envío', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const calendar = page.getByRole('dialog', { name: 'Calendario: Fecha de envío' });
  await expect(calendar).toContainText('febrero 2028');
  await expect(calendar.locator('.rdp-day_button:focus')).toBeVisible();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  await expect(calendar).toHaveCount(0); await expect(date(page)).toHaveValue('28/02/2028'); await expect(date(page)).toBeFocused();
  await trigger.click(); await page.keyboard.press('Escape'); await expect(date(page)).toBeFocused();
  const request = page.waitForRequest(request => request.url().endsWith('/api/v1/purchases') && request.method() === 'POST');
  await page.route('**/api/v1/purchases', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'ux-date' } }) }));
  await page.getByRole('button', { name: 'Guardar solicitud' }).click();
  expect((await request).postDataJSON().header.sentDate).toBe('2028-02-28');
  await expect(date(page)).toHaveValue('28/02/2028');
});

test('guardado pendiente bloquea cancelación y salida hasta confirmación del servidor', async ({ page }) => {
  await newForm(page); await complete(page, `PENDIENTE-${Date.now()}`);
  let release: (() => void) | undefined;
  await page.route('**/api/v1/purchases', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.continue(); });
  await page.getByRole('button', { name: 'Guardar solicitud' }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Guardado en curso' });
  await expect(dialog.getByRole('button')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Volver al formulario' }).click();
  await expect(page).toHaveURL(/\/nueva$/);
  await expect(page.getByText('Solicitud guardada', { exact: true })).toHaveCount(0);
  release!();
  await expect(page.getByRole('heading', { name: /^Solicitud / })).toBeVisible();
  await expect(page.getByText('Solicitud guardada', { exact: true })).toBeVisible();
});
