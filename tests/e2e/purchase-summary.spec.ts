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
  const monthDetail = page.locator('.dashboard-kpis > div').nth(2).locator('.dashboard-kpi-detail');
  const purchases = (count: number) => `${count} ${count === 1 ? 'compra' : 'compras'}`;
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
  await expect(card('Compras en \\d{4}')).toHaveText(String(before.overview.registeredThisYear + 1));
  await expect(card('Monto en [a-záéíóúñ]+')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisMonth) + BigInt(input.header.totalAmount)).toString()));
  await expect(monthDetail).toHaveText(purchases(before.overview.registeredThisMonth + 1));
  await expect(card('Monto en \\d{4}')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisYear) + BigInt(input.header.totalAmount)).toString()));
  await expect(page.getByRole('region', { name: 'Segunda revisión' })).toContainText(String(before.pending + 1));
  const row = await openRecord();
  await row.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(row).toHaveCount(0);
  await home();
  await expect(card('Compras en \\d{4}')).toHaveText(String(before.overview.registeredThisYear + 1));
  await expect(card('Monto en [a-záéíóúñ]+')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisMonth) + BigInt(input.header.totalAmount)).toString()));
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
  await expect(page.locator('.dashboard-kpis dd').filter({ hasText: /^0$/ })).toHaveCount(1);
  await expect(page.locator('.dashboard-kpis dd').filter({ hasText: /^\$0$/ })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Módulos de Cenit' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link')).toHaveCount(4);
  await expect(page.locator('.dashboard-kpis')).not.toContainText(/ejemplos/);
  // Inicio offers the frequent task directly; manual registration stays inside Compras.
  await expect(page.getByRole('link', { name: 'Subir captura', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Registrar manualmente/ })).toHaveCount(0);
});

test('los gráficos muestran detalles al interactuar y conservan sus cifras accesibles', async ({ page }) => {
  await page.route('**/api/v1/purchases/summary', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const year = body.data.overview.registrationMonth.slice(0, 4);
    body.data.overview.registrationMonth = `${year}-03`;
    body.data.overview.monthlyTotals = Array.from({ length: 12 }, (_, index) => ({ month: `${year}-${String(index + 1).padStart(2, '0')}`, count: index < 3 ? index + 1 : 0, amount: ['100000', '450000', '200000'][index] ?? '0' }));
    body.data.overview.documentTypes = [{ documentType: 'FACTURA', count: 3, amount: '450000' }, { documentType: 'BOLETA', count: 1, amount: '200000' }];
    await route.fulfill({ response, json: body });
  });
  await login(page, 'administrativo');
  await expect(page.locator('.dashboard-monthly__bar--peak')).toHaveCount(1);
  await expect(page.locator('.dashboard-monthly__column').nth(1).locator('.dashboard-monthly__bar--peak')).toHaveCount(1);
  const table = page.getByRole('table', { name: 'Monto documental por mes de envío' });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row').nth(2)).toContainText(amountLabel('450000'));
  const february = page.locator('.dashboard-monthly__column').nth(1);
  await february.hover();
  await expect(february.locator('.dashboard-chart-tooltip')).toContainText('$450.000 · 2 compras');
  await february.focus();
  await page.mouse.move(0, 0);
  await expect(february.locator('.dashboard-chart-tooltip')).toBeVisible();
  const invoice = page.getByRole('button', { name: /Factura: 3 compras, 75%/ });
  // Focusing the legend may scroll its card; compare the chart within that card.
  const donutBounds = () => page.locator('.dashboard-donut').evaluate(element => {
    const bounds = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
    return { x: bounds.x - parent.x, y: bounds.y - parent.y, width: bounds.width, height: bounds.height };
  });
  const donutBefore = await donutBounds();
  await invoice.focus();
  await expect(page.locator('.dashboard-types-detail')).toContainText('3 compras · 75% · $450.000 CLP');
  expect(await donutBounds()).toEqual(donutBefore);
  await invoice.press('Enter');
  await expect(invoice).toHaveAttribute('aria-pressed', 'true');
});

test('Inicio reúne seis u ocho altas según el ancho e indicadores en una pantalla de escritorio', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: true, sheetsSyncEnabled: true } } }));
  await page.route('**/api/v1/purchases/sheets-sync*', route => route.fulfill({ json: { data: { status: 'pending', pending: 2, lastSyncedAt: '2026-10-22T14:00:00.000Z', url: 'https://docs.google.com/spreadsheets/d/qa_only/edit' } } }));
  await page.route('**/api/v1/purchases/summary', route => route.fulfill({ json: { data: {
    requests: 86, pending: 3, currency: 'CLP', pendingAmount: '1200000', days: [], overview: {
      documentTotal: '28000000', documentTotalThisMonth: '3520000', registrationMonth: '2026-10', registeredThisYear: 48, registeredThisMonth: 21,
      sourceCounts: { manual: 50, image_capture: 26, contract_example: 10 },
      registrationDays: Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.UTC(2026, 8, 23 + index)).toISOString().slice(0, 10), count: index % 4 })),
      recentRecords: Array.from({ length: 8 }, (_, index) => ({ id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`, requestNumber: `QA-2026-0${String(index).padStart(2, '0')}`, description: 'Materiales para laboratorio de Nutrición y Dietética', sentDate: '2026-10-22', totalAmount: '1200000', createdAt: '2026-10-22T14:00:00.000Z', source: 'manual' })),
    },
  } } }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page, 'administrativo');
  await expect(page.locator('.dashboard-recent li:visible')).toHaveCount(6);
  await expect(page.locator('.dashboard-recent li').first()).toContainText('22/10/2026');
  await expect(page.getByRole('region', { name: 'Sincronización con Google Sheets' })).toContainText('Pendiente de sincronización');
  await expect(page.locator('.dashboard-kpis > div').nth(0).locator('dd').first()).toHaveText('48');
  await expect(page.locator('.dashboard-kpis > div').nth(2).locator('dd').first()).toHaveText(amountLabel('3520000'));
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.locator('.admin-content').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    // Whatever does not fit scrolls inside «Últimos registros», never the page.
    await expect(page.locator('.dashboard-recent')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.dashboard-recent li:visible')).toHaveCount(width >= 1600 ? 8 : 6);
    await page.locator('.dashboard-recent li:visible').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.dashboard-recent li:visible').last()).toBeInViewport();
    await expect.poll(() => page.locator('.admin-content').evaluate(element => element.scrollTop)).toBe(0);
  }
});
