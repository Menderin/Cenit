// HU07-T04 — Verificación de detalle en navegador: la pantalla debe mostrar exactamente lo que responde la API,
// y los estados inexistente/fallo/rol ajeno no deben mostrar ni solicitar datos de compras.
import { test, expect, type Page, type Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { credential, login } from './support/browser.js';
import { headerFields, lineFields, administrativeFields } from '../../packages/contracts/src/purchases/index.js';
import { purchaseLabels } from '../../apps/web/src/features/purchases/model/fields.js';

const origin = 'http://127.0.0.1:5174';
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const shown = (key: string, value: string | null) => value === null ? 'Sin dato'
  : ['totalAmount', 'taxAmount', 'price', 'amount'].includes(key) ? clp.format(BigInt(value))
    : key === 'sentDate' ? value.split('-').reverse().join('/') : value;

async function createFull(page: Page, tag: string) {
  const header = Object.fromEntries(Object.keys(headerFields).map(key => [key, `${tag}-${key}`])) as Record<string, string>;
  Object.assign(header, { requestNumber: `0099-${tag}`, sentDate: '2026-10-13', sentTime: '08:05:09', totalAmount: '1234567', taxAmount: '0' });
  const lines = [1, 2].map(index => Object.assign(Object.fromEntries(Object.keys(lineFields).map(key => [key, `${tag}-L${index}-${key}`])), { price: `${index}000`, amount: `${index}000`, projectCode: `000${index}` }));
  const administrative = Object.fromEntries(Object.keys(administrativeFields).map(key => [key, `${tag}-${key}`]));
  const response = await page.request.post('/api/v1/purchases', { headers: { origin }, data: { operationId: randomUUID(), header, lines, administrative } });
  expect(response.status()).toBe(201);
  return (await response.json()).data as { id: string; header: Record<string, string | null>; lines: Record<string, string | null>[]; administrative: Record<string, string | null> };
}
async function expand(scope: Locator) {
  const details = scope.locator('xpath=ancestor-or-self::details[1]');
  if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
}
/** Cada par etiqueta/valor visible dentro de `scope` debe coincidir con la respuesta. */
async function expectFields(scope: Locator, values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    const pair = scope.locator('.purchase-detail-fields > div').filter({ has: scope.page().locator('dt', { hasText: new RegExp(`^${purchaseLabels[key]!.replace(/[()]/g, '\\$&')}$`) }) });
    await expect(pair.locator('dd'), key).toHaveText(shown(key, value));
  }
}
/** Registra cualquier consulta a compras para afirmar que un rol ajeno ni siquiera la intenta. */
function purchaseRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/purchases')) seen.push(request.url()); });
  return seen;
}

test('detalle válido: cabecera, ítems, seguimiento, estado y procedencia coinciden con la API; recarga y anchos', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createFull(page, `D${Date.now()}`);
  const api = await page.request.get(`/api/v1/purchases/${record.id}`);
  expect(api.status()).toBe(200); expect(api.headers()['cache-control']).toBe('no-store');
  const data = (await api.json()).data;
  await page.goto(`/administracion/compras/${record.id}`);
  for (const pass of ['inicial', 'recarga']) {
    if (pass === 'recarga') await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Solicitud ${data.header.requestNumber}`);
    await expect(page.getByText('Pendiente de validación', { exact: true })).toBeVisible();
    await expect(page.locator('.purchase-detail-heading__amount strong')).toHaveText(clp.format(BigInt(data.header.totalAmount)));
    const main = page.locator('.purchase-detail-section').filter({ hasText: 'Datos principales' });
    await expectFields(main, { requestNumber: data.header.requestNumber, sentDate: data.header.sentDate, description: data.header.description });
    const complementary = page.locator('details').filter({ hasText: 'Datos complementarios' });
    await expand(complementary.locator('summary'));
    const { requestNumber: _r, sentDate: _s, description: _d, totalAmount: _t, ...rest } = data.header;
    await expectFields(complementary, rest);
    const items = page.locator('.purchase-detail-section').filter({ hasText: 'Ítems de la solicitud' });
    await expect(items.locator('.purchase-count')).toHaveText(String(data.lines.length));
    for (const [index, line] of (data.lines as Record<string, string | null>[]).entries()) {
      const item = items.locator('details.purchase-item').nth(index);
      await expand(item.locator('summary'));
      await expect(item.locator('summary .purchase-item__provider')).toHaveText(line.provider!);
      await expectFields(item, line);
    }
    const tracking = page.locator('details').filter({ hasText: 'Seguimiento administrativo' });
    await expand(tracking.locator('summary'));
    await expectFields(tracking, data.administrative);
    const meta = page.locator('.purchase-detail-meta');
    await expect(meta).toContainText('Ingreso manual');
    await expect(meta).toContainText(credential('administrativo').name);
    await expect(meta).toContainText(record.id);
    await expect(meta).not.toContainText('Validado por');
  }
  for (const width of [1280, 1440, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `ancho ${width}`).toBe(true);
    await page.screenshot({ path: `tmp/hu07-detalle-${width}.png`, fullPage: true });
  }
});

test('detalle inexistente e identificador malformado muestran error comprensible sin datos ni carga infinita', async ({ page }) => {
  await login(page, 'administrativo');
  for (const [id, message] of [[randomUUID(), 'Solicitud inexistente.'], ['no-es-un-id', 'Revisa los datos de la solicitud.']] as const) {
    const response = page.waitForResponse(r => r.url().endsWith(`/api/v1/purchases/${id}`));
    await page.goto(`/administracion/compras/${id}`);
    expect((await response).status()).toBe(id === 'no-es-un-id' ? 400 : 404);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Detalle de solicitud');
    await expect(page.getByText('Cargando detalle…')).toHaveCount(0);
    await expect(page.locator('.purchase-detail-heading__amount, .purchase-detail-section, .purchase-status')).toHaveCount(0);
    await page.screenshot({ path: `tmp/hu07-detalle-${id === 'no-es-un-id' ? 'malformado' : 'inexistente'}.png` });
  }
  await page.getByRole('link', { name: 'Volver a solicitudes' }).click();
  await expect(page).toHaveURL(/\/administracion\/compras$/);
});

test('fallo de servidor y de red: error visible, sin datos, y Reintentar recupera el detalle real', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createFull(page, `F${Date.now()}`);
  const path = `**/api/v1/purchases/${record.id}`;
  for (const failure of ['503', 'red'] as const) {
    await page.route(path, route => failure === '503'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible.', requestId: 'hu07' } }) })
      : route.abort());
    await page.goto(`/administracion/compras/${record.id}`);
    await expect(page.getByRole('alert')).toContainText(failure === '503' ? 'El servicio no está disponible.' : 'No se pudo conectar con el servidor.');
    await expect(page.getByText(record.header.requestNumber!)).toHaveCount(0);
    await page.unroute(path);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Solicitud ${record.header.requestNumber}`);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});

test('401 al abrir el detalle invalida la interfaz y lleva al login sin mostrar el registro', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createFull(page, `U${Date.now()}`);
  await page.route(`**/api/v1/purchases/${record.id}`, route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.', requestId: 'hu07' } }) }));
  await page.goto(`/administracion/compras/${record.id}`);
  await expect(page.getByText(record.header.requestNumber!)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toHaveCount(0);
});

test('roles ajenos y anónimo: no ven ni solicitan el detalle de una compra existente', async ({ page, browser }) => {
  await login(page, 'administrativo');
  const record = await createFull(page, `R${Date.now()}`);
  for (const role of ['docente', 'estudiante', null] as const) {
    const context = await browser.newContext({ baseURL: origin });
    const other = await context.newPage();
    const seen = purchaseRequests(other);
    if (role) await login(other, role);
    await other.goto(`/administracion/compras/${record.id}`);
    await expect(other).toHaveURL(role ? /\/academico$/ : /\/login$/);
    await expect(other.getByText(record.header.requestNumber!)).toHaveCount(0);
    await expect(other.getByText(record.header.description!)).toHaveCount(0);
    expect(seen, 'la interfaz no debe consultar compras').toEqual([]);
    const direct = await other.request.get(`/api/v1/purchases/${record.id}`);
    expect(direct.status()).toBe(role ? 403 : 401);
    expect(await direct.text()).not.toContain(record.header.requestNumber!);
    await other.screenshot({ path: `tmp/hu07-detalle-rol-${role ?? 'anonimo'}.png` });
    await context.close();
  }
});

test('cerrar sesión desde el detalle: Atrás no restaura el registro y otra cuenta no lo ve', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createFull(page, `L${Date.now()}`);
  await page.goto(`/administracion/compras/${record.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Solicitud ${record.header.requestNumber}`);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page.getByText(record.header.requestNumber!)).toHaveCount(0);
  await login(page, 'docente');
  await page.goto(`/administracion/compras/${record.id}`);
  await expect(page).toHaveURL(/\/academico$/);
  await expect(page.getByText(record.header.requestNumber!)).toHaveCount(0);
});
