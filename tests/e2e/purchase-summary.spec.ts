import { test, expect } from '@playwright/test';
import { login } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { amountLabel } from '../../apps/web/src/features/purchases/model/fields.js';

test('Inicio coincide con compras y el «por pagar» se actualiza al guardar y pagar', async ({ page }) => {
  await login(page, 'administrativo');
  await expect(page.locator('.home-figures')).toBeVisible();
  const summary = async () => (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  const before = await summary();
  const input = structuredClone(manualPurchaseExample);
  input.operationId = crypto.randomUUID();
  input.record.requestNumber = 'HOME-' + crypto.randomUUID().slice(0, 8);
  input.record.recordDate = before.overview.registrationMonth + '-15';
  input.record.totalAmount = '9007199254740993';
  const saved = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: input });
  expect(saved.status()).toBe(201);
  const card = (label: string) => page.locator('.home-figures > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp('^' + label + '$') }) }).locator('dd').first();
  const yearDetail = page.locator('.home-figures > div').nth(0).locator('.home-figure__detail');
  const monthDetail = page.locator('.home-figures > div').nth(1).locator('.home-figure__detail');
  const purchases = (count: number) => `${count} ${count === 1 ? 'compra' : 'compras'}`;
  const nav = page.getByRole('navigation', { name: 'Sistemas administrativos' });
  const home = () => nav.getByRole('link', { name: 'Inicio', exact: true }).click();
  const yearPurchases = (count: number) => new RegExp(`^${purchases(count)}( · \\d+ proyectos?)?$`);
  const openRecord = async () => {
    await nav.getByRole('link', { name: 'Registro de compras', exact: true }).click();
    await page.getByLabel('Buscar compras', { exact: true }).fill(input.record.requestNumber);
    const row = page.getByRole('region', { name: 'Compras registradas', exact: true }).getByRole('row').filter({ hasText: input.record.requestNumber });
    await expect(row).toBeVisible();
    return row;
  };
  await openRecord();
  await home();
  await expect(yearDetail).toHaveText(yearPurchases(before.overview.registeredThisYear + 1));
  await expect(card('[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisMonth) + BigInt(input.record.totalAmount)).toString()));
  await expect(monthDetail).toHaveText(purchases(before.overview.registeredThisMonth + 1));
  await expect(card('Gasto en \\d{4}')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisYear) + BigInt(input.record.totalAmount)).toString()));
  expect(await summary()).toMatchObject({ pending: before.pending + 1, pendingAmount: (BigInt(before.pendingAmount) + BigInt(input.record.totalAmount)).toString() });
  const row = await openRecord();
  await row.getByRole('button', { name: new RegExp(`^Situación de pago de ${input.record.requestNumber}: pendiente`) }).click();
  await expect(row.getByRole('button', { name: new RegExp(`^Situación de pago de ${input.record.requestNumber}: pagado`) })).toBeVisible();
  await home();
  // Pagarla no cambia lo gastado: sólo la saca del «por pagar».
  await expect(yearDetail).toHaveText(yearPurchases(before.overview.registeredThisYear + 1));
  await expect(card('[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+')).toHaveText(amountLabel((BigInt(before.overview.documentTotalThisMonth) + BigInt(input.record.totalAmount)).toString()));
  expect(await summary()).toMatchObject({ pending: before.pending, pendingAmount: before.pendingAmount });
});

test('Inicio muestra error y permite reintentar hasta un resumen vacío', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/assets/loans*', route => route.fulfill({ json: { data: [], pagination: { page: 1, pageSize: 5, total: 0 } } }));
  await page.route('**/api/v1/purchases/summary', route => route.fulfill({
    status: unavailable ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(unavailable ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Resumen temporalmente no disponible.', requestId: crypto.randomUUID() } }
      : { data: { requests: 0, pending: 0, currency: 'CLP', pendingAmount: '0', days: [], overview: { documentTotal: '0', documentTotalThisMonth: '0', registrationMonth: '2026-10', registeredThisYear: 0, registeredThisMonth: 0, sourceCounts: { manual: 0, image_capture: 0, contract_example: 0 }, registrationDays: [], recentRecords: [] } } }),
  }));
  await login(page, 'administrativo');
  await expect(page.getByRole('alert')).toContainText('Resumen temporalmente no disponible.');
  await expect(page.locator('.home-figures')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.home-figures')).toBeVisible();
  await expect(page.getByText(/^Aún no hay compras registradas en \d{4}\.$/)).toBeVisible();
  // The year and the month, each with its number of purchases; Bienes lives in the side column.
  await expect(page.locator('.home-figures > div')).toHaveCount(2);
  await expect(page.locator('.home-figure__detail').filter({ hasText: /^0 compras$/ })).toHaveCount(2);
  await expect(page.locator('.home-figure__value').filter({ hasText: /^\$0$/ })).toHaveCount(1);
  // Without overdue loans, Bienes says so next to its title and turns to the next returns (none here).
  await expect(page.getByRole('heading', { name: 'Bienes', exact: true })).toBeVisible();
  await expect(page.getByText('Sin vencidos', { exact: true })).toBeVisible();
  await expect(page.getByText('No hay bienes prestados en este momento.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Últimas compras', exact: true })).toBeVisible();
  await expect(page.getByText('Aún no hay compras registradas.', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Módulos de Cenit' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link')).toHaveCount(4);
  await expect(page.locator('.home-figures')).not.toContainText(/ejemplos/);
  // Inicio offers the frequent task directly; manual registration stays inside Compras.
  await expect(page.getByRole('link', { name: 'Registrar capturas', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Registrar a mano/ })).toHaveCount(0);
});

test('los gráficos muestran detalles al interactuar y conservan sus cifras accesibles', async ({ page }) => {
  await page.route('**/api/v1/purchases/summary', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const year = body.data.overview.registrationMonth.slice(0, 4);
    body.data.overview.registrationMonth = `${year}-03`;
    body.data.overview.monthlyTotals = Array.from({ length: 12 }, (_, index) => ({ month: `${year}-${String(index + 1).padStart(2, '0')}`, count: index < 3 ? index + 1 : 0, amount: ['100000', '450000', '200000'][index] ?? '0' }));
    body.data.overview.documentTypes = [{ documentType: 'FACTURA', count: 3, amount: '450000' }, { documentType: 'BOLETA', count: 1, amount: '200000' }];
    body.data.overview.lineTotal = '650000';
    body.data.overview.projects = [{ code: '20702029', name: 'Programa de especialidades', count: 3, amount: '450000', months: ['100000', '250000', '100000', ...Array(9).fill('0')] }, { code: null, name: null, count: 1, amount: '200000', months: ['0', '200000', ...Array(10).fill('0')] }];
    body.data.overview.accounts = [{ code: '410103', name: 'Remuneraciones Profesores Hora', count: 3, amount: '450000' }, { code: '420405', name: 'Comestibles y Bebidas', count: 1, amount: '200000' }];
    await route.fulfill({ response, json: body });
  });
  await login(page, 'administrativo');
  // Every month carries its figure, and each bar is exactly proportional to the largest month.
  const columns = page.locator('.home-chart__column');
  await expect(columns).toHaveCount(12);
  await expect(columns.nth(2)).toHaveClass(/is-current/);
  const compact = (value: number) => `$${new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
  await expect(columns.nth(1).locator('.home-chart__value')).toHaveText(compact(450000));
  await expect(columns.nth(2).locator('.home-chart__value')).toHaveText(compact(200000));
  const barHeight = (index: number) => columns.nth(index).locator('.home-chart__bar').evaluate(element => element.getBoundingClientRect().height);
  expect((await barHeight(1)) / (await barHeight(2))).toBeCloseTo(450000 / 200000, 1);
  expect((await barHeight(1)) / (await barHeight(0))).toBeCloseTo(450000 / 100000, 1);
  const table = page.getByRole('table', { name: 'Monto por mes' });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row').nth(2)).toContainText(amountLabel('450000'));
  // The general Inicio no longer repeats a table per project (the picker opens each one): the year is split by account
  // into blocks whose area is their share, each one describing its account, amount and share for screen readers too.
  await expect(page.getByRole('columnheader', { name: 'Proyecto', exact: true })).toHaveCount(0);
  const accounts = page.getByRole('list', { name: 'Gasto por cuenta contable', exact: true }).getByRole('listitem');
  await expect(accounts).toHaveCount(2);
  await expect(accounts.first()).toContainText('Remuneraciones Profesores Hora');
  await expect(accounts.first()).toContainText(amountLabel('450000'));
  await expect(accounts.first()).toContainText('69%');
  const area = (index: number) => accounts.nth(index).evaluate(element => { const rect = element.getBoundingClientRect(); return rect.width * rect.height; });
  expect((await area(0)) / (await area(1))).toBeCloseTo(450000 / 200000, 1);
});

test('Inicio cabe en la ventana sin desplazar la página de 1280×720 a 2560×1440, en dos columnas', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { sheetsSyncEnabled: true } } }));
  await page.route('**/api/v1/purchases/sheets-sync*', route => route.fulfill({ json: { data: { status: 'pending', pending: 2, lastSyncedAt: '2026-10-22T14:00:00.000Z', url: 'https://docs.google.com/spreadsheets/d/qa_only/edit' } } }));
  await page.route('**/api/v1/purchases/summary', route => route.fulfill({ json: { data: {
    requests: 86, pending: 3, currency: 'CLP', pendingAmount: '1200000', days: [], overview: {
      documentTotal: '28000000', documentTotalThisMonth: '3520000', registrationMonth: '2026-10', registeredThisYear: 48, registeredThisMonth: 21,
      sourceCounts: { manual: 50, image_capture: 26, contract_example: 10 },
      registrationDays: Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.UTC(2026, 8, 23 + index)).toISOString().slice(0, 10), count: index % 4 })),
      year: '2026', availableYears: [2026, 2025], documentTotalThisYear: '28000000', lineTotal: '28000000', projectCount: 14,
      monthlyTotals: Array.from({ length: 12 }, (_, index) => ({ month: `2026-${String(index + 1).padStart(2, '0')}`, count: index < 10 ? 4 : 0, amount: index < 10 ? String(1500000 + index * 250000) : '0' })),
      // More projects and accounts than fit on a small window: each list scrolls inside itself.
      projects: Array.from({ length: 14 }, (_, index) => ({ code: String(99000100 + index), name: `Proyecto de prueba ${index + 1}`, count: 3, amount: String(2000000 - index * 100000), months: Array.from({ length: 12 }, (_, month) => month < 10 ? '150000' : '0') })),
      accounts: Array.from({ length: 8 }, (_, index) => ({ code: String(420100 + index), name: `Cuenta de prueba ${index + 1}`, count: 4, amount: String(3500000 - index * 200000) })),
      recentRecords: Array.from({ length: 8 }, (_, index) => ({ id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`, requestNumber: `QA-2026-0${String(index).padStart(2, '0')}`, description: 'Materiales para laboratorio de Nutrición y Dietética', sentDate: '2026-10-22', totalAmount: '1200000', createdAt: '2026-10-22T14:00:00.000Z', source: 'manual' })),
    },
  } } }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page, 'administrativo');
  await expect(page.locator('.home-figures > div').nth(0).locator('.home-figure__detail')).toHaveText('48 compras · 14 proyectos');
  await expect(page.locator('.home-figures > div').nth(1).locator('dd').first()).toHaveText(amountLabel('3520000'));
  await expect(page.getByRole('region', { name: 'Sincronización con Google Sheets' })).toContainText('Pendiente de sincronización');
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The whole summary fits: only a list that has more rows than fit (loans, recent purchases) scrolls inside itself.
    await expect.poll(() => page.locator('.admin-content').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    // No list opens with a row cut in half, none leaves a blank gap under its last row, and none moves sideways.
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.home-fit__scroll')].every(list => {
      const box = list.parentElement!.getBoundingClientRect(), bottom = Math.min(list.getBoundingClientRect().bottom, box.bottom);
      const cut = [...list.querySelectorAll('[data-row]')].some(row => { const rect = row.getBoundingClientRect(); return rect.top < bottom - 1 && rect.bottom > bottom + 1; });
      const overflowing = list.scrollHeight > list.clientHeight + 1;
      return !cut && list.scrollWidth <= list.clientWidth && (!overflowing || box.bottom - list.getBoundingClientRect().bottom <= 1);
    }))).toBe(true);
    const months = await page.locator('.home-chart__months').boundingBox(), mapHeading = await page.locator('.home-map .home-heading').boundingBox();
    expect(months!.y + months!.height).toBeLessThanOrEqual(mapHeading!.y);
    // Every account block shows only what fits in it: nothing spills out of its tile at any window size.
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.home-map__tile')].every(tile => tile.scrollHeight <= tile.clientHeight + 1 && tile.scrollWidth <= tile.clientWidth + 1))).toBe(true);
    // The main column (spending and accounts) and the side column (Bienes and recent purchases) sit side by side.
    const main = await page.locator('.home-main').boundingBox(), rail = await page.locator('.home-rail').boundingBox();
    expect(rail!.x).toBeGreaterThan(main!.x + main!.width);
    expect(rail!.width).toBeGreaterThanOrEqual(340);
  }
});

test('Inicio por proyecto: toda la fila abre la compra y la flecha vuelve al resumen general del mismo año', async ({ page }) => {
  const purchaseId = '00000000-0000-4000-8000-000000000101';
  await page.route('**/api/v1/purchases/projects/99000002*', route => route.fulfill({ json: { data: {
    code: '99000002', name: 'Proyecto de prueba', inCatalog: true, year: '2026', availableYears: [2026], count: 1, amount: '1200000', lineCount: 1, linesWithoutAmount: 0,
    yearLineTotal: '4800000', providerCount: 1, units: [{ code: '990101', name: 'Unidad de prueba', count: 1, amount: '1200000' }],
    accounts: [{ code: '420405', name: 'Comestibles y Bebidas', count: 1, amount: '1200000' }], providers: [{ name: 'Proveedor de prueba', count: 1, amount: '1200000' }],
    monthlyTotals: Array.from({ length: 12 }, (_, index) => ({ month: `2026-${String(index + 1).padStart(2, '0')}`, count: index === 9 ? 1 : 0, amount: index === 9 ? '1200000' : '0' })),
    purchases: [{ id: purchaseId, requestNumber: 'QA-PROY-01', sentDate: '2026-10-22', description: 'Materiales de laboratorio', provider: 'Proveedor de prueba', accountingCode: '420405', accountName: 'Comestibles y Bebidas', documentType: 'FACTURA', amount: '1200000' }],
    lastSentDate: '2026-10-22',
  } } }));
  await login(page, 'administrativo');
  await page.goto('/administracion?year=2026&project=99000002');
  await expect(page.getByRole('heading', { level: 1, name: 'Proyecto de prueba' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Unidades del proyecto' })).toContainText('990101');
  // Clicking anywhere on the row (here, the provider) opens the purchase; the number stays the keyboard link.
  const purchases = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Proveedor y detalle', exact: true }) });
  await expect(purchases.getByRole('link', { name: 'Abrir la compra QA-PROY-01 de Proveedor de prueba', exact: true })).toBeVisible();
  await purchases.getByText('Proveedor de prueba', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/administracion/compras/${purchaseId}$`));
  await page.goBack();
  // The project summary reads as its own screen: an arrow goes back to the general Inicio, keeping the year.
  await page.getByRole('link', { name: 'Volver a Inicio', exact: true }).click();
  await expect(page).toHaveURL(/\/administracion\?year=2026$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio', exact: true })).toBeVisible();
});
