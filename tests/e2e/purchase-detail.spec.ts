import { test, expect, type Locator, type Page } from '@playwright/test';
import { purchaseFieldLabels } from '../../packages/contracts/src/purchases/labels.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { login } from './support/browser.js';

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
async function expectFields(container: Locator, fields: Record<string, string | null>) {
  for (const [key, value] of Object.entries(fields)) {
    const expected = value === null ? 'Sin dato' : key === 'sentDate' ? value.split('-').reverse().join('/')
      : ['totalAmount', 'taxAmount', 'price', 'amount'].includes(key) ? currency.format(BigInt(value)) : value;
    await expect(container.getByText(purchaseFieldLabels[key]!, { exact: true }).locator('..').locator('dd')).toHaveText(expected);
  }
}

async function createRecord(page: Page) {
  const input = structuredClone(manualPurchaseExample);
  input.operationId = crypto.randomUUID();
  input.header.requestNumber = `DETAIL-${crypto.randomUUID().slice(0, 8)}`;
  const response = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: input });
  expect(response.status()).toBe(201);
  const record = (await response.json()).data;
  expect(record.header).toEqual(input.header);
  expect(record.lines).toEqual(input.lines);
  expect(record.administrative).toEqual(input.administrative);
  return record;
}

test('detalle coincide con la API, conserva revisión y se recorre con teclado en móvil', async ({ page }) => {
  await login(page, 'administrativo');
  const created = await createRecord(page);
  const validation = await page.request.post(`/api/v1/purchases/${created.id}/validation`, {
    headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: created.version },
  });
  expect(validation.status()).toBe(200);
  const response = await page.request.get(`/api/v1/purchases/${created.id}`);
  expect(response.status()).toBe(200);
  const record = (await response.json()).data;
  expect(record.reviewStatus).toBe('reviewed');
  expect(record.administrative).toEqual(created.administrative);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/administracion/compras/${record.id}`);
  const check = async () => {
    await expect(page.getByRole('heading', { name: `Solicitud ${record.header.requestNumber}` })).toBeVisible();
    await expect(page.getByText('Revisado en Cenit', { exact: true })).toBeVisible();
    await expect(page.locator('.purchase-detail-heading__amount strong')).toHaveText(currency.format(BigInt(record.header.totalAmount)));
    await expect(page.locator('.purchase-detail-description')).toHaveText(record.header.description);
    await expectFields(page.locator('.purchase-detail-summary'), { requestNumber: record.header.requestNumber, sentDate: record.header.sentDate });
    for (const [index, line] of record.lines.entries()) {
      const item = page.locator('details.purchase-item').filter({ has: page.locator('summary').getByText(`Ítem ${index + 1}`, { exact: true }) });
      await item.locator('summary').focus(); await page.keyboard.press('Enter');
      await expectFields(item, line);
    }
    // Read-only boxes show known values first; empty ones live in a closed «Mostrar … sin dato» disclosure that still holds every field.
    const box = (name: string) => page.locator('.purchase-detail-box').filter({ has: page.getByRole('heading', { name, exact: true }) });
    const { requestNumber: _number, sentDate: _date, description: _description, totalAmount: _total, ...other } = record.header;
    await expectFields(box('Datos de la solicitud'), other);
    const { documentType, ...administrative } = record.administrative;
    await expectFields(box('Seguimiento administrativo'), administrative);
    await expect(page.locator('.purchase-detail-summary')).toContainText(documentType ?? 'Sin dato');
    await expect(page.locator('.purchase-detail-summary')).toContainText('Ingreso manual');
    await expect(box('Registro en Cenit')).toContainText(record.createdBy.name);
    await expect(box('Registro en Cenit')).toContainText(record.reviewedBy.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await check();
  await page.reload();
  await check();
});

for (const editing of [false, true]) {
  const screen = editing ? 'edición' : 'detalle', suffix = editing ? '/editar' : '';
  test(`${screen}: enlace inválido e inexistente vuelven al registro con teclado y filtros`, async ({ page }) => {
    await login(page, 'administrativo');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/administracion/compras/enlace-invalido${suffix}`);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('El enlace de esta compra no es válido.');
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
    const back = alert.getByRole('link', { name: 'Volver al registro', exact: true });
    await expect(back).toHaveAttribute('href', '/administracion/compras');
    await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `tmp/scrum-106/${editing ? 'edicion' : 'detalle'}-400-1440.png`, animations: 'disabled' });
    await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/administracion\/compras$/);

    const record = await createRecord(page);
    const returnTo = `/administracion/compras?q=${record.header.requestNumber}&allYears=1&sort=sentDateAsc&pageSize=50`;
    await page.goto(returnTo);
    const detail = page.getByRole('link', { name: `Ver detalles de ${record.header.requestNumber}`, exact: true });
    await expect(detail).toHaveAttribute('aria-disabled', 'false');
    if (editing) {
      await detail.click();
      await expect(page.getByRole('link', { name: 'Editar', exact: true })).toBeVisible();
    }
    const deleted = await page.request.delete(`/api/v1/purchases/${record.id}`, {
      headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: record.version },
    });
    expect(deleted.status()).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await (editing ? page.getByRole('link', { name: 'Editar', exact: true }) : detail).click();
    await expect(alert).toContainText('No encontramos esta compra.');
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Datos principales' })).toHaveCount(0);
    await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(back).toHaveAttribute('href', returnTo);
    await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `tmp/scrum-106/${editing ? 'edicion' : 'detalle'}-404-390.png`, animations: 'disabled' });
    await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new URL(returnTo, page.url()).href);
    await expect(page.getByLabel('Buscar solicitudes', { exact: true })).toHaveValue(record.header.requestNumber);
  });

  test(`${screen}: error temporal y fallo de red conservan el reintento sin mostrar datos`, async ({ page }) => {
    await login(page, 'administrativo');
    const record = await createRecord(page);
    const endpoint = `**/api/v1/purchases/${record.id}`;
    await page.setViewportSize({ width: 390, height: 844 });
    for (const network of [false, true]) {
      await page.route(endpoint, route => network ? route.abort('failed') : route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Detalle temporalmente indisponible', requestId: 'test' } } }));
      await page.goto(`/administracion/compras/${record.id}${suffix}`);
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(network ? 'No se pudo conectar con el servidor.' : 'Detalle temporalmente indisponible');
      await expect(page.getByRole('heading', { name: 'Datos principales' })).toHaveCount(0);
      await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveCount(0);
      const retry = alert.getByRole('button', { name: 'Reintentar', exact: true });
      await retry.focus(); await expect(retry).toBeFocused();
      await page.unroute(endpoint);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: editing ? 'Editar compra' : `Solicitud ${record.header.requestNumber}`, exact: true })).toBeVisible();
      if (editing) await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue(record.header.requestNumber);
    }
  });
}
