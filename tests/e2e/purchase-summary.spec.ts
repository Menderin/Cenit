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
  input.header.sentDate = before.overview.registrationMonth + '-15';
  input.header.totalAmount = '9007199254740993';
  const saved = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: input });
  expect(saved.status()).toBe(201);
  const card = (label: string) => page.locator('.dashboard-kpis > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp('^' + label + '$') }) }).locator('dd').first();
  const home = () => page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  const openRecord = async () => {
    await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
    await page.getByLabel('Buscar solicitudes', { exact: true }).fill(input.header.requestNumber);

    const pending = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
    const row = pending.getByRole('row').filter({ hasText: input.header.requestNumber });
    await expect(row).toBeVisible();
    return row;
  };
  await openRecord();
  await home();
  await expect(card('Compras con fecha documental este año')).toHaveText(String(before.overview.registeredThisYear + 1));
  await expect(card('Monto documental este mes')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisMonth) + BigInt(input.header.totalAmount)).toString()));
  await expect(card('Compras con fecha documental este mes')).toHaveText(String(before.overview.registeredThisMonth + 1));
  await expect(page.getByRole('region', { name: 'Segunda revisión' })).toContainText(String(before.pending + 1));
  const row = await openRecord();
  await row.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(row).toHaveCount(0);
  await home();
  await expect(card('Compras con fecha documental este año')).toHaveText(String(before.overview.registeredThisYear + 1));
  await expect(card('Monto documental este mes')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisMonth) + BigInt(input.header.totalAmount)).toString()));
  await expect(page.getByRole('region', { name: 'Segunda revisión' })).toContainText(amountLabel(before.pendingAmount));
});

test('Inicio muestra error y permite reintentar hasta un resumen vacío', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/purchases/summary', route => route.fulfill({
    status: unavailable ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(unavailable ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Resumen temporalmente no disponible.', requestId: crypto.randomUUID() } }
      : { data: { requests: 0, pending: 0, currency: 'CLP', pendingAmount: '0', days: [], overview: { documentTotal: '0', documentTotalThisMonth: '0', registrationMonth: '2026-10', registeredThisYear: 0, registeredThisMonth: 0, sourceCounts: { manual: 0, image_capture: 0, contract_example: 0 }, registrationDays: [], recentRecords: [] } } }),
  }));
  await login(page, 'administrativo');
  await expect(page.getByRole('alert')).toContainText('Resumen temporalmente no disponible.');
  await expect(page.locator('.dashboard-kpis')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.dashboard-kpis')).toBeVisible();
  await expect(page.getByText('Aún no hay compras registradas', { exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-kpis > div')).toHaveCount(3);
  await expect(page.locator('.dashboard-kpis dd').filter({ hasText: /^0$/ })).toHaveCount(2);
  await expect(page.getByRole('navigation', { name: 'Módulos de Cenit' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link')).toHaveCount(4);
  await expect(page.locator('.dashboard-kpis')).not.toContainText(/ejemplos/);
  await expect(page.getByRole('link', { name: /Subir captura/ })).toHaveCount(0);
});

test('Inicio reúne cinco altas e indicadores en una pantalla de escritorio y se adapta a móvil', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: true, sheetsSyncEnabled: true } } }));
  await page.route('**/api/v1/purchases/sheets-sync*', route => route.fulfill({ json: { data: { status: 'pending', pending: 2, lastSyncedAt: '2026-10-22T14:00:00.000Z', url: 'https://docs.google.com/spreadsheets/d/qa_only/edit' } } }));
  await page.route('**/api/v1/purchases/summary', route => route.fulfill({ json: { data: {
    requests: 86, pending: 3, currency: 'CLP', pendingAmount: '1200000', days: [], overview: {
      documentTotal: '28000000', documentTotalThisMonth: '3520000', registrationMonth: '2026-10', registeredThisYear: 48, registeredThisMonth: 21,
      sourceCounts: { manual: 50, image_capture: 26, contract_example: 10 },
      registrationDays: Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.UTC(2026, 8, 23 + index)).toISOString().slice(0, 10), count: index % 4 })),
      recentRecords: Array.from({ length: 5 }, (_, index) => ({ id: `00000000-0000-4000-8000-00000000000${index}`, requestNumber: `QA-2026-00${index}`, description: 'Materiales para laboratorio de Nutrición y Dietética', sentDate: '2026-10-22', totalAmount: '1200000', createdAt: '2026-10-22T14:00:00.000Z', source: 'manual' })),
    },
  } } }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page, 'administrativo');
  await expect(page.locator('.dashboard-recent li')).toHaveCount(5);
  await expect(page.locator('.dashboard-recent li').first()).toContainText('22/10/2026');
  await expect(page.getByRole('region', { name: 'Sincronización con Google Sheets' })).toContainText('Pendiente de sincronización');
  await expect(page.locator('.dashboard-kpis > div').nth(0).locator('dd').first()).toHaveText('48');
  await expect(page.locator('.dashboard-kpis > div').nth(2).locator('dd').first()).toHaveText(amountLabel('3520000'));
  const graph = page.locator('.dashboard-chart svg');
  // The pointer would move the tooltip, so keep it outside the chart while testing the keyboard.
  await page.mouse.move(0, 0);
  await graph.focus();
  await expect(page.locator('.dashboard-chart-tooltip')).toContainText('23/09/2026');
  await expect(page.locator('.dashboard-chart-tooltip')).toContainText('0 compras incorporadas');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.dashboard-chart-tooltip')).toContainText('24/09/2026');
  await expect(page.locator('.dashboard-chart-tooltip')).toContainText('1 compra incorporada');
  await page.getByRole('link', { name: 'Abrir Compras' }).focus();
  await page.locator('.dashboard-chart-bar').first().hover();
  await expect(page.locator('.dashboard-chart-tooltip')).toBeVisible();
  await expect(page.locator('.dashboard-chart-tooltip')).toContainText('24/09/2026');
  for (const width of [1280, 1366, 1440]) {
    await page.setViewportSize({ width, height: 720 });
    await expect.poll(() => page.locator('.admin-content').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    await expect(page.locator('.dashboard-recent li').last()).toBeInViewport();
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.dashboard-recent li').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.dashboard-recent li').last()).toBeInViewport();
});
