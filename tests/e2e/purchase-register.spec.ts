import { test, expect } from '@playwright/test';
import { login } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

test('registro: una lista histórica sin segunda revisión, conservando ambos estados y paginación', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: false, sheetsSyncEnabled: false } } }));
  await login(page, 'administrativo');
  await expect(page.locator('.dashboard-kpis dt')).toHaveText(['Compras registradas', 'Monto documental registrado', 'Registradas este mes', 'Desde captura']);
  await expect(page.locator('.dashboard-chart')).toHaveCount(0);
  const prefix = 'HIST-' + crypto.randomUUID().slice(0, 8), origin = new URL(page.url()).origin;
  for (let i = 0; i < 22; i++) {
    const input = structuredClone(manualPurchaseExample);
    input.operationId = crypto.randomUUID(); input.header.requestNumber = `${prefix}-${i}`;
    const saved = await page.request.post('/api/v1/purchases', { headers: { origin }, data: input });
    expect(saved.status()).toBe(201);
    if (i % 2) expect((await page.request.post(`/api/v1/purchases/${(await saved.json()).data.id}/validation`, { headers: { origin }, data: { expectedVersion: 1 } })).status()).toBe(200);
  }
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro de compras', exact: true })).toBeVisible();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(prefix);
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await expect(list.getByRole('row')).toHaveCount(21);
  await expect(list.getByText('22 registros', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Por revisar en Cenit|Revisados en Cenit/ })).toHaveCount(0);
  await list.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(list.getByRole('row')).toHaveCount(3);
  await expect(page).toHaveURL(/page=2/);
  await list.getByRole('link', { name: 'Ver detalles', exact: true }).first().click();
  await expect(page.locator('.purchase-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-register-${width}.png`, fullPage: true, animations: 'disabled' });
  }
});

test('registro: guardado explícito sin segunda revisión y estado de Sheets separado', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: false, sheetsSyncEnabled: true } } }));
  let state: 'pending' | 'error' | 'synced' = 'pending';
  await page.route('**/api/v1/purchases/sheets-sync*', route => route.fulfill({ json: { data: { status: state, pending: state === 'synced' ? 0 : 1, lastSyncedAt: state === 'synced' ? '2026-10-21T00:00:00.000Z' : null, url: 'https://docs.google.com/spreadsheets/d/fake_test_only/edit' } } }));
  await login(page, 'administrativo');
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  await page.getByRole('link', { name: 'Registrar manualmente', exact: true }).click();
  await page.getByLabel('Nº Documento / solicitud *', { exact: true }).fill('MANUAL-' + crypto.randomUUID().slice(0, 8));
  await page.getByLabel('Fecha de envío *', { exact: true }).fill('21/10/2026');
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill('9007199254740993');
  await page.getByLabel('Descripción *', { exact: true }).fill('Registro ficticio de prueba');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Solicitud MANUAL-/ })).toBeVisible();
  const sync = page.getByRole('region', { name: 'Sincronización con Google Sheets', exact: true });
  await expect(sync).toContainText('Pendiente de sincronización');
  await expect(page.getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(0);
  state = 'error'; await page.reload();
  await expect(sync).toContainText('Error de sincronización');
  state = 'synced'; await page.reload();
  await expect(sync.getByText('Sincronizado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('También se retirará su copia de Google Sheets');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
});
