import { test, expect } from '@playwright/test';
import { login } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { amountLabel } from '../../apps/web/src/features/purchases/model/fields.js';

test('Inicio coincide con compras y se actualiza al volver después de guardar y validar', async ({ page }) => {
  await login(page, 'administrativo');
  await expect(page.locator('.dashboard-kpis')).toBeVisible();
  const before = (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  const input = structuredClone(manualPurchaseExample);
  input.operationId = crypto.randomUUID();
  input.header.requestNumber = 'HOME-' + crypto.randomUUID().slice(0, 8);
  input.header.totalAmount = '9007199254740993';
  const saved = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: input });
  expect(saved.status()).toBe(201);
  const card = (label: string) => page.locator('.dashboard-kpis > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp('^' + label + '$') }) }).locator('dd').first();
  const home = () => page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  const openRecord = async () => {
    await page.getByRole('link', { name: 'Ver solicitudes', exact: true }).click();
    await page.getByLabel('Buscar solicitudes', { exact: true }).fill(input.header.requestNumber);
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    const pending = page.getByRole('region', { name: 'Pendientes de validación', exact: true });
    const row = pending.getByRole('row').filter({ hasText: input.header.requestNumber });
    await expect(row).toBeVisible();
    return row;
  };
  await openRecord();
  await home();
  await expect(card('Solicitudes')).toHaveText(String(before.totalCount + 1));
  await expect(card('Pendientes de revisión')).toHaveText(String(before.pendingCount + 1));
  await expect(card('Monto pendiente')).toHaveText(amountLabel((BigInt(before.pendingAmount) + BigInt(input.header.totalAmount)).toString()));
  const row = await openRecord();
  await row.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(row).toHaveCount(0);
  await home();
  await expect(card('Solicitudes')).toHaveText(String(before.totalCount + 1));
  await expect(card('Pendientes de revisión')).toHaveText(String(before.pendingCount));
  await expect(card('Monto pendiente')).toHaveText(amountLabel(before.pendingAmount));
});

test('Inicio muestra error y permite reintentar hasta un resumen vacío', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/purchases/summary', route => route.fulfill({
    status: unavailable ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(unavailable ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Resumen temporalmente no disponible.', requestId: crypto.randomUUID() } }
      : { data: { totalCount: 0, pendingCount: 0, currency: 'CLP', pendingAmount: '0', pendingByDate: [] } }),
  }));
  await login(page, 'administrativo');
  await expect(page.getByRole('alert')).toContainText('Resumen temporalmente no disponible.');
  await expect(page.locator('.dashboard-kpis')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.dashboard-kpis')).toBeVisible();
  await expect(page.getByText('No hay solicitudes pendientes de revisión.', { exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-kpis dd').filter({ hasText: /^0$/ })).toHaveCount(2);
});
