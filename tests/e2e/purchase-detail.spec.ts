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
    await expectFields(page.locator('.purchase-detail-section').filter({ has: page.getByRole('heading', { name: 'Datos principales' }) }), {
      requestNumber: record.header.requestNumber, sentDate: record.header.sentDate, description: record.header.description,
    });
    for (const [index, line] of record.lines.entries()) {
      const item = page.locator('details.purchase-item').filter({ has: page.locator('summary').getByText(`Ítem ${index + 1}`, { exact: true }) });
      await item.locator('summary').focus(); await page.keyboard.press('Enter');
      await expectFields(item, line);
    }
    const complementary = page.locator('details').filter({ has: page.locator('summary').getByText('Datos complementarios', { exact: true }) });
    await complementary.locator('summary').focus(); await page.keyboard.press('Enter');
    const { requestNumber: _number, sentDate: _date, description: _description, totalAmount: _total, ...other } = record.header;
    await expectFields(complementary, other);
    const administration = page.locator('details').filter({ has: page.locator('summary').getByText('Seguimiento administrativo', { exact: true }) });
    await administration.locator('summary').focus(); await page.keyboard.press('Enter');
    await expectFields(administration, record.administrative);
    const provenance = page.locator('.purchase-detail-section').filter({ has: page.getByRole('heading', { name: 'Registro y procedencia' }) });
    await expect(provenance).toContainText('Ingreso manual');
    await expect(provenance).toContainText(record.createdBy.name);
    await expect(provenance).toContainText(record.reviewedBy.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await check();
  await page.reload();
  await check();
});

test('detalle inexistente y fallo temporal no muestran datos y permiten recuperar', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${crypto.randomUUID()}`);
  await expect(page.getByRole('alert')).toContainText('Solicitud inexistente');
  await expect(page.getByRole('heading', { name: 'Datos principales' })).toHaveCount(0);
  await page.route(`**/api/v1/purchases/${record.id}`, route => route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Detalle temporalmente indisponible', requestId: 'test' } } }));
  await page.goto(`/administracion/compras/${record.id}`);
  await expect(page.getByRole('alert')).toContainText('Detalle temporalmente indisponible');
  await expect(page.getByRole('heading', { name: 'Datos principales' })).toHaveCount(0);
  await page.unroute(`**/api/v1/purchases/${record.id}`);
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Solicitud ${record.header.requestNumber}` })).toBeVisible();
});
