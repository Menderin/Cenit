import { test, expect, type Page } from '@playwright/test';
import { login, santiagoToday } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  const menu = page.getByRole('listbox', { name: label, exact: true });
  await menu.getByRole('option', { name: option, exact: true }).click();
  await expect(menu).toHaveCount(0);
}

test('registro: una lista histórica sin segunda revisión, conservando ambos estados y paginación', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: false, sheetsSyncEnabled: false } } }));
  await login(page, 'administrativo');
  const prefix = 'HIST-' + crypto.randomUUID().slice(0, 8), origin = new URL(page.url()).origin, sentDate = santiagoToday();
  for (let i = 0; i < 22; i++) {
    const input = structuredClone(manualPurchaseExample);
    input.operationId = crypto.randomUUID(); input.header.requestNumber = `${prefix}-${i}`; input.header.sentDate = sentDate;
    const saved = await page.request.post('/api/v1/purchases', { headers: { origin }, data: input });
    expect(saved.status()).toBe(201);
    if (i % 2) expect((await page.request.post(`/api/v1/purchases/${(await saved.json()).data.id}/validation`, { headers: { origin }, data: { expectedVersion: 1 } })).status()).toBe(200);
  }
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
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
  await choose(page, 'Ordenar por fecha de envío', 'Más antiguas');
  await expect(list.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Página 2', exact: true }).click();
  await list.getByRole('link', { name: /^Ver detalles/ }).first().click();
  await expect(page.locator('.purchase-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ordenar por fecha de envío:/ })).toHaveText('Más antiguas');
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-register-${width}.png`, fullPage: true, animations: 'disabled' });
  }
});

test('historial: conserva año, mes y orden al recargar', async ({ page }) => {
  await login(page, 'administrativo');
  const prefix = `PERIODO-${crypto.randomUUID().slice(0, 8)}`;
  const currentDate = santiagoToday(), historicalYear = Number(currentDate.slice(0, 4)) - 1;
  const records = [
    { name: `${prefix}-Actual`, date: currentDate },
    { name: `${prefix}-Febrero-inicio`, date: `${historicalYear}-02-01` },
    { name: `${prefix}-Febrero-fin`, date: `${historicalYear}-02-28` },
    { name: `${prefix}-Marzo`, date: `${historicalYear}-03-01` },
  ];
  const headers = { Origin: new URL(page.url()).origin };
  for (const record of records) {
    const input = structuredClone(manualPurchaseExample);
    input.operationId = crypto.randomUUID();
    input.header.requestNumber = record.name;
    input.header.sentDate = record.date;
    expect((await page.request.post('/api/v1/purchases', { headers, data: input })).status()).toBe(201);
  }

  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(prefix);
  const list = page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
  const rows = list.getByRole('link', { name: /^Ver detalles de PERIODO-/ });
  const expectRows = (...indices: number[]) => expect(rows).toHaveText(indices.map(index => records[index]!.name));
  await expectRows(0);

  const year = page.getByRole('button', { name: /^Año de envío:/ });
  await year.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Año de envío', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(year).toBeFocused();
  await choose(page, 'Año de envío', String(historicalYear));
  await expectRows(3, 2, 1);

  await choose(page, 'Mes de envío', 'Febrero');
  await expectRows(2, 1);
  await choose(page, 'Ordenar por fecha de envío', 'Más antiguas');
  await expectRows(1, 2);
  await choose(page, 'Registros por página: Por revisar en Cenit', '50');
  await page.reload();
  await expect(year).toHaveText(String(historicalYear));
  await expect(page.getByRole('button', { name: /^Mes de envío:/ })).toHaveText('Febrero');
  await expect(page.getByRole('button', { name: /^Ordenar por fecha de envío:/ })).toHaveText('Más antiguas');
  await expect(page.getByRole('button', { name: /^Registros por página: Por revisar en Cenit:/ })).toHaveText('50');
  await expectRows(1, 2);
});

test('registro: guardado explícito sin segunda revisión y estado de Sheets separado', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: false, sheetsSyncEnabled: true } } }));
  let state: 'pending' | 'error' | 'synced' = 'pending';
  await page.route('**/api/v1/purchases/sheets-sync*', route => route.fulfill({ json: { data: { status: state, pending: state === 'synced' ? 0 : 1, lastSyncedAt: state === 'synced' ? '2026-10-21T00:00:00.000Z' : null, url: 'https://docs.google.com/spreadsheets/d/fake_test_only/edit' } } }));
  await login(page, 'administrativo');
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
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

test('fechas segmentadas: placeholders, errores, rangos y calendarios coherentes', async ({ page }) => {
  await page.route('**/api/v1/purchases?**', async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), availableYears: [2026, 2024] } }); });
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const exact = page.getByLabel('Fecha de envío', { exact: true });
  const exactMonth = page.getByRole('textbox', { name: 'Fecha de envío, mes', exact: true });
  const exactYear = page.getByRole('textbox', { name: 'Fecha de envío, año', exact: true });
  const from = page.getByRole('textbox', { name: 'Rango de fechas: desde', exact: true });
  const fromMonth = page.getByRole('textbox', { name: 'Rango de fechas: desde, mes', exact: true });
  const fromYear = page.getByRole('textbox', { name: 'Rango de fechas: desde, año', exact: true });
  const to = page.getByRole('textbox', { name: 'Rango de fechas: hasta', exact: true });
  const toMonth = page.getByRole('textbox', { name: 'Rango de fechas: hasta, mes', exact: true });
  const toYear = page.getByRole('textbox', { name: 'Rango de fechas: hasta, año', exact: true });
  const clear = page.getByRole('button', { name: 'Limpiar', exact: true });
  const queries: string[] = [];
  const fillDate = async (dayInput: typeof exact, monthInput: typeof exactMonth, yearInput: typeof exactYear, digits: string) => {
    await dayInput.fill(''); await monthInput.fill(''); await yearInput.fill(digits.slice(4));
    await monthInput.fill(digits.slice(2, 4)); await dayInput.fill(digits.slice(0, 2));
  };
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/purchases') queries.push(request.url()); });
  await expect(exact).toBeEnabled();
  await expect(clear).toBeDisabled();
  const searchWidth = (await page.getByLabel('Buscar solicitudes', { exact: true }).boundingBox())!.width;
  const dateControl = page.locator('.purchase-input--exact-date .cenit-date-input--segmented');
  await page.locator('#purchase-more-filters').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  const dateBox = (await dateControl.boundingBox())!;
  await page.mouse.click(dateBox.x + dateBox.width - 52, dateBox.y + dateBox.height / 2);
  await expect(exact).toBeFocused();
  await exact.pressSequentially('24');
  await expect(exact).toHaveValue('24');
  await expect(exactMonth).toHaveValue(''); await expect(exactMonth).toHaveAttribute('placeholder', 'mm');
  await expect(exactYear).toHaveValue(''); await expect(exactYear).toHaveAttribute('placeholder', 'aaaa');
  expect((await page.getByLabel('Buscar solicitudes', { exact: true }).boundingBox())!.width).toBeLessThanOrEqual(searchWidth);
  await expect(clear).toBeEnabled();
  await page.screenshot({ path: 'tmp/purchase-date-mask.png', animations: 'disabled' });
  await exact.fill('24'); await exactMonth.fill('40');
  await expect(exact).toHaveValue('24'); await expect(exactMonth).toHaveValue('');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toContainText('El mes');
  await exactYear.fill('2026');
  await expect(exactYear).toHaveValue('2026');
  await expect(exact).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toBeVisible();
  await expect(page.getByText('Completa una fecha válida o corrige el rango para actualizar los filtros. Se conservan los últimos resultados.', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(350); expect(queries).toHaveLength(0);
  await fillDate(exact, exactMonth, exactYear, '29022024');
  await expect(page).toHaveURL(/dateFrom=2024-02-29&dateTo=2024-02-29/);
  await expect(exact).not.toHaveAttribute('aria-invalid', 'true');
  // Wait for every list query (pending/reviewed when enabled), not just the URL change.
  await expect(page.getByText('Actualizando resultados…', { exact: true })).toHaveCount(0);
  const count = queries.length;
  await exactMonth.fill('40');
  await expect(exact).toHaveValue('29'); await expect(exactMonth).toHaveValue(''); await expect(exactYear).toHaveValue('2024');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toContainText('El mes');
  await exactYear.fill('1926');
  await expect(exactYear).toHaveValue('');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toContainText('El año');
  await exactYear.fill('2024'); await exactMonth.fill('02');
  await expect(page).toHaveURL(/dateFrom=2024-02-29&dateTo=2024-02-29/);
  const applied = page.url();
  await exact.fill('32');
  await expect(exact).toHaveValue(''); await expect(exactMonth).toHaveValue('02'); await expect(exactYear).toHaveValue('2024');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toContainText('El día');
  await exactYear.fill('2025'); await exact.fill('29');
  await expect(exact).toHaveValue(''); await expect(exactMonth).toHaveValue('02'); await expect(exactYear).toHaveValue('2025');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toContainText('El día');
  await page.waitForTimeout(350); expect(page.url()).toBe(applied); expect(queries.length).toBe(count);
  await exact.fill('28');
  await expect(page).toHaveURL(/dateFrom=2025-02-28&dateTo=2025-02-28/);
  await exactYear.fill('2024'); await exact.fill('29');
  await expect(page).toHaveURL(/dateFrom=2024-02-29&dateTo=2024-02-29/);

  await expect(page.getByText('Actualizando resultados…', { exact: true })).toHaveCount(0);
  const rangeQueryCount = queries.length;
  await fillDate(from, fromMonth, fromYear, '30102026');
  await expect(from).toHaveValue('30'); await expect(fromMonth).toHaveValue('10'); await expect(fromYear).toHaveValue('2026');
  await expect(exact).toHaveValue('');
  await to.fill('24'); await toMonth.fill('40');
  await expect(to).toHaveValue('24'); await expect(toMonth).toHaveValue('');
  await expect(page.locator('.purchase-input--date-range [role="alert"]')).toContainText('El mes');
  await toYear.fill('2026'); await expect(toYear).toHaveValue('2026');
  await expect(to).toHaveAttribute('aria-invalid', 'true');
  await page.waitForTimeout(350); expect(page.url()).toBe(applied); expect(queries.length).toBe(rangeQueryCount);
  await fillDate(to, toMonth, toYear, '29102026');
  await expect(page.locator('.purchase-input--date-range [role="alert"]')).toBeVisible();
  await page.waitForTimeout(350); expect(page.url()).toBe(applied);
  await fillDate(to, toMonth, toYear, '03112026');
  await expect(page).toHaveURL(/dateFrom=2026-10-30&dateTo=2026-11-03/);
  await expect(clear).toHaveCount(1);
  await expect(page.locator('.purchase-filter-chips')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Limpiar rango de fechas' })).toHaveCount(0);
  const rangeTrigger = page.getByRole('button', { name: 'Abrir calendario: rango de fechas', exact: true });
  await rangeTrigger.click();
  const range = page.getByRole('dialog', { name: 'Calendario de rango de fechas', exact: true });
  await expect(range.locator('select')).toHaveCount(0);
  const day = (value: string) => range.locator(`[data-day="${value}"] .rdp-day_button`);
  const colors = async (value: string) => day(value).evaluate(element => ({ bg: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
  expect(await colors('2026-10-30')).toEqual({ bg: 'rgb(52, 52, 59)', color: 'rgb(255, 255, 255)' });
  expect(await colors('2026-11-03')).toEqual(await colors('2026-10-30'));
  expect(await colors('2026-11-01')).toEqual({ bg: 'rgba(0, 0, 0, 0)', color: 'rgb(69, 69, 77)' });
  await page.screenshot({ path: 'tmp/purchase-date-range.png', animations: 'disabled' });
  await day('2026-10-20').click();
  await expect(range).toBeVisible();
  await day('2026-10-16').click();
  await expect(range).toBeVisible();
  await expect(page).toHaveURL(/dateFrom=2026-10-16&dateTo=2026-10-20/);
  await from.focus(); await from.press('ArrowDown');
  await expect(range).toBeVisible();
  await day('2026-10-24').click(); await day('2026-10-24').click();
  await expect(range).toBeVisible();
  await expect(from).toHaveValue('24'); await expect(fromMonth).toHaveValue('10'); await expect(fromYear).toHaveValue('2026');
  await expect(to).toHaveValue('24'); await expect(toMonth).toHaveValue('10'); await expect(toYear).toHaveValue('2026');
  await expect(page).toHaveURL(/dateFrom=2026-10-24&dateTo=2026-10-24/);
  await range.getByRole('button', { name: 'Ir al mes anterior' }).click();
  await expect(range.locator('.rdp-caption_label').first()).toHaveText('septiembre 2026');
  await page.keyboard.press('Escape'); await expect(range).toHaveCount(0); await expect(rangeTrigger).toBeFocused();
  await fillDate(exact, exactMonth, exactYear, '24102026');
  await expect(page).toHaveURL(/dateFrom=2026-10-24&dateTo=2026-10-24/);
  const singleTrigger = page.getByRole('button', { name: 'Abrir calendario: Fecha de envío', exact: true });
  await singleTrigger.click();
  const single = page.getByRole('dialog', { name: 'Calendario: Fecha de envío', exact: true });
  await expect(single.locator('select')).toHaveCount(0);
  const selected = single.locator('.rdp-selected .rdp-day_button');
  expect(await selected.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(52, 52, 59)');
  await page.screenshot({ path: 'tmp/purchase-date-single.png', animations: 'disabled' });
  await expect(single.getByRole('button', { name: /^Elegir/ })).toHaveCount(0);
  await single.locator('[data-day="2026-10-23"] .rdp-day_button').click();
  await expect(single).toBeVisible();
  await fillDate(exact, exactMonth, exactYear, '24102026');
  await expect(single).toBeVisible();
  await singleTrigger.click(); await expect(single).toHaveCount(0);
  await singleTrigger.click(); await page.getByRole('heading', { name: 'Registro de compras', exact: true }).click(); await expect(single).toHaveCount(0);
  await singleTrigger.click();
  await page.keyboard.press('Escape'); await expect(single).toHaveCount(0); await expect(exact).toBeFocused();
  await clear.click(); await expect(clear).toBeDisabled(); await expect(exact).toHaveValue(''); await expect(from).toHaveValue(''); await expect(to).toHaveValue('');
  await fillDate(from, fromMonth, fromYear, '01012024'); await fillDate(to, toMonth, toYear, '31122024');
  await expect(page).toHaveURL(/dateFrom=2024-01-01&dateTo=2024-12-31/);
  await expect(from).toHaveValue('01'); await expect(fromMonth).toHaveValue('01'); await expect(fromYear).toHaveValue('2024');
  await expect(to).toHaveValue('31'); await expect(toMonth).toHaveValue('12'); await expect(toYear).toHaveValue('2024');
  await clear.click();
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await rangeTrigger.click(); await expect(range).toBeVisible();
    await expect(range.locator('.rdp-month')).toHaveCount(2);
    await expect.poll(() => range.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-date-${width}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(range).toHaveCount(0);
  }
  await fillDate(exact, exactMonth, exactYear, '24102026'); await exact.press('ControlOrMeta+a'); await exact.press('Backspace');
  await expect(exact).toHaveValue(''); await expect(exact).toHaveAttribute('placeholder', 'dd');
  await expect(exactMonth).toHaveAttribute('placeholder', 'mm'); await expect(exactYear).toHaveAttribute('placeholder', 'aaaa');
  await expect(page.locator('.purchase-input--exact-date [role="alert"]')).toHaveCount(0);
  await fillDate(from, fromMonth, fromYear, '01012024'); await fillDate(to, toMonth, toYear, '31122024');
  await expect(page).toHaveURL(/dateFrom=2024-01-01&dateTo=2024-12-31/);
  await from.press('ControlOrMeta+a'); await from.press('Backspace');
  await to.press('ControlOrMeta+a'); await to.press('Backspace');
  await expect(from).toHaveValue(''); await expect(to).toHaveValue('');
  await expect(from).toHaveAttribute('placeholder', 'dd'); await expect(fromMonth).toHaveAttribute('placeholder', 'mm'); await expect(fromYear).toHaveAttribute('placeholder', 'aaaa');
  await expect(to).toHaveAttribute('placeholder', 'dd'); await expect(toMonth).toHaveAttribute('placeholder', 'mm'); await expect(toYear).toHaveAttribute('placeholder', 'aaaa');
  await expect(page.locator('.purchase-input--date-range [role="alert"]')).toHaveCount(0);
  await exact.evaluate(element => {
    const clipboard = new DataTransfer(); clipboard.setData('text/plain', '24022026');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: clipboard }));
  });
  await expect(exact).toHaveValue('24'); await expect(exactMonth).toHaveValue('02'); await expect(exactYear).toHaveValue('2026');
  const pastedUrl = page.url();
  await exactMonth.fill('');
  await expect(exact).toHaveValue('24'); await expect(exactMonth).toHaveValue(''); await expect(exactYear).toHaveValue('2026');
  expect(page.url()).toBe(pastedUrl);
  await exactMonth.fill('03');
  await expect(page).toHaveURL(/dateFrom=2026-03-24&dateTo=2026-03-24/);
  const correctedMonthUrl = page.url();
  await exactMonth.selectText(); await exactMonth.press('Backspace');
  await expect(exact).toHaveValue('24'); await expect(exactMonth).toHaveValue(''); await expect(exactYear).toHaveValue('2026');
  await page.waitForTimeout(350); expect(page.url()).toBe(correctedMonthUrl);
  await exactMonth.fill('03'); await expect(page).toHaveURL(/dateFrom=2026-03-24&dateTo=2026-03-24/);
  await exactMonth.selectText(); await exactMonth.press('Delete');
  await expect(exactMonth).toHaveValue(''); await expect(exact).toHaveValue('24'); await expect(exactYear).toHaveValue('2026');
  await exactMonth.fill('03'); await expect(page).toHaveURL(/dateFrom=2026-03-24&dateTo=2026-03-24/);
  await exact.press('ControlOrMeta+a'); await exact.press('Backspace');
  await expect(exact).toHaveValue(''); await expect(exactMonth).toHaveValue(''); await expect(exactYear).toHaveValue('');
});

test('fechas del historial: vacío, metadata ausente, reintento y límites inclusivos', async ({ page }) => {
  let years: number[] | undefined = [];
  await page.route('**/api/v1/purchases?**', async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), availableYears: years } }); });
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const exact = page.getByLabel('Fecha de envío', { exact: true });
  const exactMonth = page.getByRole('textbox', { name: 'Fecha de envío, mes', exact: true });
  const exactYear = page.getByRole('textbox', { name: 'Fecha de envío, año', exact: true });
  const fillDate = async (digits: string) => { await exact.fill(digits.slice(0, 2)); await exactMonth.fill(digits.slice(2, 4)); await exactYear.fill(digits.slice(4)); };
  await expect(exact).toBeDisabled();
  await expect(page.getByText('Las fechas estarán disponibles cuando haya compras registradas.')).toBeVisible();
  years = undefined; await page.reload();
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await expect(page.getByText('No se pudieron cargar los años del historial.')).toBeVisible();
  years = [2026, 2024]; await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(exact).toBeEnabled();
  await fillDate('01012024');
  await page.getByRole('button', { name: 'Abrir calendario: Fecha de envío', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Calendario: Fecha de envío', exact: true });
  await expect(calendar.getByRole('button', { name: 'Ir al mes anterior' })).toBeDisabled();
  await fillDate('31122026'); await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'Ir al mes siguiente' })).toBeDisabled();
  await page.keyboard.press('Escape');
  // A year without purchases inside the interval remains valid; empty parts remain native placeholders.
  await fillDate('15062025'); await expect(page).toHaveURL(/dateFrom=2025-06-15/);
  await exact.fill(''); await expect(exact).toHaveValue(''); await expect(exact).toHaveAttribute('placeholder', 'dd');
  await expect(exactMonth).toHaveValue('06'); await expect(exactYear).toHaveValue('2025');
  await exact.fill('15'); await expect(exact).toHaveValue('15'); await expect(exactMonth).toHaveValue('06'); await expect(exactYear).toHaveValue('2025');
  expect((await Promise.all([exact.inputValue(), exactMonth.inputValue(), exactYear.inputValue()])).join('/')).not.toContain('_');
  await exact.fill(''); await exactMonth.fill(''); await exactYear.fill('');
  await expect(exact).toHaveValue(''); await expect(exactMonth).toHaveValue(''); await expect(exactYear).toHaveValue('');
});

test('filtros: distribución estable, teclado virtual, zoom equivalente y movimiento al diez por ciento', async ({ page }) => {
  await page.route('**/api/v1/purchases?**', async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), availableYears: [2026, 2024] } }); });
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  const search = page.getByLabel('Buscar solicitudes', { exact: true }), clear = page.getByRole('button', { name: 'Limpiar', exact: true });
  const before = await clear.boundingBox(); await search.fill('FICTICIO'); await expect(clear).toBeEnabled();
  const after = await clear.boundingBox(); expect(after?.x).toBe(before?.x); expect(after?.width).toBe(before?.width);
  await clear.click(); await expect(clear).toBeDisabled();
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const exact = page.getByLabel('Fecha de envío', { exact: true });
  await expect(exact).toBeEnabled(); await exact.focus();
  await page.keyboard.insertText('24');
  await expect(exact).toHaveValue('24');
  await expect(page.getByRole('textbox', { name: 'Fecha de envío, mes', exact: true })).toHaveAttribute('placeholder', 'mm');
  await expect(page.getByRole('textbox', { name: 'Fecha de envío, año', exact: true })).toHaveAttribute('placeholder', 'aaaa');
  await clear.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await expect(page.locator('#purchase-more-filters')).toBeHidden();
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const panel = page.locator('#purchase-more-filters');
  await panel.evaluate(element => { for (const animation of element.getAnimations()) animation.updatePlaybackRate(0.1); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tmp/purchase-filters-slow.png' });
  await panel.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await exact.focus();
  const clip = await page.locator('.purchase-filter-extra__clip').boundingBox(), box = await exact.boundingBox();
  expect(box!.x - clip!.x).toBeGreaterThanOrEqual(5); expect(clip!.x + clip!.width - box!.x - box!.width).toBeGreaterThanOrEqual(5);
});
