import { test, expect, type Page } from '@playwright/test';
import { credential, login } from './support/browser.js';

async function newForm(page: Page) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
}
// Los campos de la fila se ubican por su id: su etiqueta lleva marcas («sugerido», «falta») que cambian con el contenido.
const field = (page: Page, key: string) => page.locator(`#purchase-record-${key}`);
const number = (page: Page) => field(page, 'requestNumber');
const date = (page: Page) => field(page, 'recordDate');
async function complete(page: Page, value: string) {
  await number(page).fill(value);
  await date(page).fill('29/02/2028');
  await field(page, 'description').fill('Solicitud ficticia para verificar interacción');
  await field(page, 'totalAmount').fill('200000');
}
async function loseSessionCheck(page: Page) {
  await page.route('**/api/v1/auth/session', route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toHaveText('No se pudo comprobar la sesión. Intenta nuevamente.');
  await expect(number(page)).toHaveCount(0);
}

test('volver distingue un formulario vacío, cambios revertidos y cambios reales, sin enviar compras', async ({ page }) => {
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/purchases') posts++; });
  await newForm(page);
  await number(page).fill('Revertido'); await number(page).fill('');
  const back = page.getByRole('link', { name: 'Volver al registro', exact: true });
  await back.click();
  await expect(page).toHaveURL(/\/compras$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  await field(page, 'provider').fill('Proveedor ficticio');
  await back.click();
  const dialog = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await expect(dialog.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(back).toBeFocused();
  await expect(field(page, 'provider')).toHaveValue('Proveedor ficticio');
  await back.click(); await dialog.getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/compras$/);
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  await expect(field(page, 'provider')).toHaveValue('');
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
  await expect(page.getByRole('region', { name: /^Avisos/ }).getByText('Saliste de Cenit', { exact: true })).toBeVisible();
});

test('fallo temporal oculta y recupera la misma cuenta, la fila y la operación original', async ({ page }) => {
  await newForm(page);
  await complete(page, `RECUPERADA-${Date.now()}`);
  await field(page, 'provider').fill('Proveedor ficticio conservado');
  const attempts: unknown[] = [];
  await page.route('**/api/v1/purchases', async route => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'ux-test' } }) });
  });
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Tus datos siguen aquí');
  await loseSessionCheck(page);
  await page.unroute('**/api/v1/auth/session'); await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(field(page, 'provider')).toHaveValue('Proveedor ficticio conservado');
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect.poll(() => attempts.length).toBe(2); expect(attempts[1]).toEqual(attempts[0]);
});

test('el borrador oculto vence y no se entrega a otra cuenta', async ({ page }) => {
  await page.clock.install(); await newForm(page); await number(page).fill('PRIVADO');
  await loseSessionCheck(page);
  await page.clock.fastForward(7201000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('region', { name: /^Avisos/ }).getByText('Tu sesión expiró', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(date(page)).toBeFocused(); await expect(date(page)).toHaveAttribute('aria-invalid', 'true');
  await date(page).fill('29/02/2028');
  const trigger = page.getByRole('button', { name: 'Abrir calendario: Fecha', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const calendar = page.getByRole('dialog', { name: 'Calendario: Fecha' });
  await expect(calendar).toContainText('febrero 2028');
  await expect(calendar.locator('.rdp-day_button:focus')).toBeVisible();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  await expect(calendar).toHaveCount(0); await expect(date(page)).toHaveValue('28/02/2028'); await expect(date(page)).toBeFocused();
  await trigger.click(); await page.keyboard.press('Escape'); await expect(date(page)).toBeFocused();
  const request = page.waitForRequest(request => request.url().endsWith('/api/v1/purchases') && request.method() === 'POST');
  await page.route('**/api/v1/purchases', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'ux-date' } }) }));
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  expect((await request).postDataJSON().record.recordDate).toBe('2028-02-28');
  await expect(date(page)).toHaveValue('28/02/2028');
});

test('guardado pendiente bloquea la salida hasta la confirmación del servidor', async ({ page }) => {
  await newForm(page); await complete(page, `PENDIENTE-${Date.now()}`);
  let release: (() => void) | undefined;
  await page.route('**/api/v1/purchases', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.continue(); });
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Guardado en curso' });
  await expect(dialog.getByRole('button')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Volver al formulario' }).click();
  await expect(page).toHaveURL(/\/nueva$/);
  await expect(page.getByText('Compra guardada', { exact: true })).toHaveCount(0);
  release!();
  await expect(page.getByRole('dialog')).toContainText('Solicitud PENDIENTE-');
  await expect(page.getByText('Compra guardada', { exact: true })).toBeVisible();
});
