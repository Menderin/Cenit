import { test, expect, type Page } from '@playwright/test';
import { login } from './support/browser.js';
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
  await choose(page, 'Ordenar por fecha de envío', 'Más antiguas');
  await expect(list.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Página 2', exact: true }).click();
  await list.getByRole('link', { name: 'Ver detalles', exact: true }).first().click();
  await expect(page.locator('.purchase-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ordenar por fecha de envío:/ })).toHaveText('Más antiguas');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-register-${width}.png`, fullPage: true, animations: 'disabled' });
  }
});

test('historial de 800 compras: períodos, orden, páginas acotadas y tamaño conservados', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: false, sheetsSyncEnabled: false } } }));
  const records = Array.from({ length: 800 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    requestNumber: `DEMO-HIST-${String(index + 1).padStart(4, '0')}`,
    sentDate: `${2023 + Math.floor(index / 200)}-${String(index % 12 + 1).padStart(2, '0')}-${String(Math.floor(index % 200 / 12) + 1).padStart(2, '0')}`,
    description: 'Compra ficticia para comprobar la consulta del historial', totalAmount: '200000', documentType: 'Solicitud de compra',
    reviewStatus: 'pending', version: 1, source: 'manual', exampleId: null,
  }));
  await page.route('**/api/v1/purchases?**', async route => {
    const query = new URL(route.request().url()).searchParams, size = Number(query.get('pageSize')), current = Number(query.get('page'));
    const filtered = records.filter(record => (!query.get('dateFrom') || record.sentDate >= query.get('dateFrom')!) && (!query.get('dateTo') || record.sentDate <= query.get('dateTo')!))
      .sort((a, b) => (a.sentDate.localeCompare(b.sentDate) || a.id.localeCompare(b.id)) * (query.get('sort') === 'sentDateAsc' ? 1 : -1));
    await route.fulfill({ json: { data: filtered.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total: filtered.length }, availableYears: [2026, 2025, 2024, 2023], totals: { currency: 'CLP', documentTotal: (BigInt(filtered.length) * 200000n).toString() } } });
  });
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  const year = page.getByRole('button', { name: /^Año de envío:/ }), month = page.getByRole('button', { name: /^Mes de envío:/ });
  const size = page.getByRole('button', { name: /^Registros por página: Compras registradas:/ });
  await expect(list.getByText('1–20 de 800 registros', { exact: true })).toBeVisible();
  await expect(list.getByRole('row')).toHaveCount(21);
  await expect(month).toBeDisabled();
  const filtersButton = page.getByRole('button', { name: 'Más filtros', exact: true });
  const filterPanel = page.locator('#purchase-more-filters');
  const resultsHeading = list.getByRole('heading', { name: 'Compras registradas', exact: true });
  const initialHeadingTop = await resultsHeading.evaluate(element => element.getBoundingClientRect().top);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await filtersButton.click();
  await expect(filterPanel).toBeVisible();
  await page.waitForTimeout(50);
  const firstHeadingTop = await resultsHeading.evaluate(element => element.getBoundingClientRect().top);
  await page.waitForTimeout(50);
  const secondHeadingTop = await resultsHeading.evaluate(element => element.getBoundingClientRect().top);
  expect(firstHeadingTop).toBeGreaterThan(initialHeadingTop);
  expect(secondHeadingTop).toBeGreaterThan(firstHeadingTop);
  const openingTransitions = await filterPanel.evaluate(element => element.getAnimations().map(animation => ({
    property: (animation as CSSTransition).transitionProperty,
    duration: animation.effect?.getComputedTiming().duration,
  })));
  expect(openingTransitions).toContainEqual({ property: 'opacity', duration: 150 });
  expect(openingTransitions).toContainEqual({ property: 'grid-template-rows', duration: 150 });
  await filterPanel.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await filtersButton.click();
  const closingTransitions = await filterPanel.evaluate(element => element.getAnimations().map(animation => ({
    property: (animation as CSSTransition).transitionProperty,
    duration: animation.effect?.getComputedTiming().duration,
  })));
  expect(closingTransitions).toContainEqual({ property: 'opacity', duration: 150 });
  expect(closingTransitions).toContainEqual({ property: 'grid-template-rows', duration: 150 });
  await expect(filterPanel).toBeHidden();

  await year.click();
  const yearMenu = page.getByRole('listbox', { name: 'Año de envío', exact: true });
  await expect(yearMenu).toBeVisible();
  const menuMotion = await yearMenu.evaluate(element => ({
    side: element.getAttribute('data-side'),
    enterOffset: getComputedStyle(element).getPropertyValue('--purchase-select-enter-y').trim(),
    transitions: element.getAnimations().map(animation => ({
      property: (animation as CSSTransition).transitionProperty,
      duration: animation.effect?.getComputedTiming().duration,
    })),
  }));
  expect(menuMotion.transitions).toContainEqual({ property: 'opacity', duration: 150 });
  expect(menuMotion.transitions).toContainEqual({ property: 'translate', duration: 150 });
  expect(menuMotion.enterOffset).toBe(menuMotion.side === 'top' ? '4px' : '-4px');
  await page.keyboard.press('Escape');
  await expect(yearMenu).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await filtersButton.click();
  await expect(filterPanel).toBeVisible();
  const reducedMotionTransitions = await filterPanel.evaluate(element => element.getAnimations().map(animation => (animation as CSSTransition).transitionProperty));
  expect(reducedMotionTransitions).toContain('opacity');
  expect(reducedMotionTransitions).not.toContain('translate');
  expect(reducedMotionTransitions).not.toContain('grid-template-rows');
  const buttonStyle = await filtersButton.evaluate(element => {
    const style = getComputedStyle(element); return { radius: style.borderRadius, shadow: style.boxShadow, height: style.height, color: style.color };
  });
  for (const control of [year, size]) expect(await control.evaluate(element => {
    const style = getComputedStyle(element); return { radius: style.borderRadius, shadow: style.boxShadow, height: style.height, color: style.color };
  })).toEqual(buttonStyle);
  await list.getByRole('button', { name: 'Página 40', exact: true }).click();
  await expect(list.getByText('781–800 de 800 registros', { exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await choose(page, 'Registros por página: Compras registradas', '50');
  await expect(list.getByText('Página 1 de 16', { exact: true })).toBeVisible();
  await expect(list.getByRole('row')).toHaveCount(51);
  await choose(page, 'Año de envío', '2024');
  await expect(month).toBeEnabled(); await month.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('f');
  await expect(page.getByRole('option', { name: 'Febrero', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/dateFrom=2024-02-01&dateTo=2024-02-29/);
  await expect(list.locator('tbody tr')).toHaveCount(17);
  await choose(page, 'Ordenar por fecha de envío', 'Más antiguas');
  await expect(list.locator('.purchase-sent-date').first()).toHaveText('01/02/2024');
  await page.reload();
  await expect(year).toHaveText('2024'); await expect(month).toHaveText('Febrero'); await expect(size).toHaveText('50');
  await expect(page.getByRole('button', { name: /^Ordenar por fecha de envío:/ })).toHaveText('Más antiguas');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(list.getByText('1–50 de 800 registros', { exact: true })).toBeVisible();
  await choose(page, 'Registros por página: Compras registradas', '20');
  await expect(list.getByText('Página 1 de 40', { exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await year.focus(); await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('listbox', { name: 'Año de envío', exact: true });
  await expect(menu.getByRole('option', { name: 'Todos los años', exact: true })).toBeFocused();
  const reducedMenuTransitions = await menu.evaluate(element => element.getAnimations().map(animation => (animation as CSSTransition).transitionProperty));
  expect(reducedMenuTransitions).toContain('opacity');
  expect(reducedMenuTransitions).not.toContain('translate');
  await page.keyboard.press('End'); await expect(menu.getByRole('option', { name: '2023', exact: true })).toBeFocused();
  await page.keyboard.press('Home'); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0); await expect(year).toBeFocused();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(list.getByRole('button', { name: 'Página 40', exact: true })).toBeVisible();
    await page.locator('#admin-content').evaluate(element => { element.scrollTop = 0; });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(year).toHaveText('Año'); await expect(month).toHaveText('Mes');
    for (const control of [year, month]) expect(await control.locator('span').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `tmp/purchase-history-${width}.png`, animations: 'disabled' });
    await size.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `tmp/purchase-history-pagination-${width}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await year.click(); await expect(menu).toBeVisible();
  await page.screenshot({ path: 'tmp/purchase-history-menu.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
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
