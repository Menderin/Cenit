import { test, expect, type Page } from '@playwright/test';
import { login, santiagoToday } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  const menu = page.getByRole('listbox', { name: label, exact: true });
  await menu.getByRole('option', { name: option, exact: true }).click();
  await expect(menu).toHaveCount(0);
}

test('registro: una sola lista con situación de pago, paginación y ficha lateral', async ({ page }) => {
  await login(page, 'administrativo');
  const prefix = 'HIST-' + crypto.randomUUID().slice(0, 8), origin = new URL(page.url()).origin, recordDate = santiagoToday();
  for (let i = 0; i < 22; i++) {
    const input = structuredClone(manualPurchaseExample);
    input.operationId = crypto.randomUUID(); input.record.requestNumber = `${prefix}-${i}`; input.record.recordDate = recordDate;
    if (i % 4 === 0) input.record.paymentSituation = 'Pendiente de pago';
    if (i % 4 === 2) input.record.paymentSituation = 'En revisión';
    const saved = await page.request.post('/api/v1/purchases', { headers: { origin }, data: input });
    expect(saved.status()).toBe(201);
    if (i % 2) expect((await page.request.post(`/api/v1/purchases/${(await saved.json()).data.id}/payment-situation`, { headers: { origin }, data: { expectedVersion: 1, paymentSituation: 'PAGADO' } })).status()).toBe(200);
  }
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro de compras', exact: true })).toBeVisible();
  await page.getByLabel('Buscar compras', { exact: true }).fill(prefix);
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  await expect(list.getByRole('row')).toHaveCount(21);
  await expect(list.getByText('22 registros', { exact: true })).toBeVisible();
  const pills = list.getByRole('button', { name: /^Situación de pago de HIST-/ });
  for (const label of ['Pendiente de pago', 'Pagado', 'En revisión']) {
    await expect(pills.getByText(label, { exact: true }).first()).toBeVisible();
  }
  const pillSizes = await pills.evaluateAll(elements => elements.map(element => {
    const { width, height } = element.getBoundingClientRect();
    const label = element.querySelector('.purchase-pill__label')!;
    return { width, height, text: label.textContent, textWidth: label.scrollWidth, availableWidth: label.clientWidth };
  }));
  expect(new Set(pillSizes.map(pill => pill.width)).size).toBe(1);
  expect(pillSizes.filter(pill => pill.height !== 28 || pill.textWidth > pill.availableWidth)).toEqual([]);
  const payment = list.getByRole('group', { name: 'Situación de pago', exact: true });
  await expect(payment.getByRole('button')).toHaveText(['Todas22', 'Pendientes11', 'Pagadas11']);
  await payment.getByRole('button', { name: /^Pagadas/ }).click();
  await expect(page).toHaveURL(/paymentSituation=PAGADO/);
  await expect(list.getByText('11 registros', { exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: /: pagado\. Volver a pendiente$/ })).toHaveCount(11);
  await payment.getByRole('button', { name: /^Todas/ }).click();
  await expect(list.getByText('22 registros', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(list.getByRole('row')).toHaveCount(3);
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('button', { name: /^Fecha: más recientes primero/ }).click();
  await expect(list.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Página 2', exact: true }).click();
  const rowLink = list.getByRole('link', { name: /^Abrir la ficha de la compra/ }).first();
  await rowLink.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(/Solicitud HIST-/);
  await sheet.getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(rowLink).toBeFocused();
  await expect(list.getByText(/^Página 2 de /)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Fecha: más antiguas primero/ })).toBeVisible();
  for (const width of [1440, 1280, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const table = list.getByRole('region', { name: 'Tabla: Compras registradas', exact: true });
    const didOverflow = width === 1000;
    await expect.poll(() => table.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(didOverflow);
    await expect.poll(() => table.evaluate(element => {
      const frame = element.getBoundingClientRect();
      return [...element.querySelectorAll('thead th:nth-last-child(-n + 2)')].every(cell => {
        const bounds = cell.getBoundingClientRect();
        return bounds.left >= frame.left && bounds.right <= frame.right + 1;
      });
    })).toBe(true);
    if (didOverflow) await expect(table).toHaveAccessibleDescription('Desplaza la tabla para ver las demás columnas.');
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
    input.record.requestNumber = record.name;
    input.record.recordDate = record.date;
    expect((await page.request.post('/api/v1/purchases', { headers, data: input })).status()).toBe(201);
  }

  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await page.getByLabel('Buscar compras', { exact: true }).fill(prefix);
  const list = page.getByRole('region', { name: 'Compras registradas', exact: true });
  const rows = list.getByRole('link', { name: /^Abrir la ficha de la compra PERIODO-/ });
  const expectRows = (...indices: number[]) => expect(rows).toHaveText(indices.map(index => records[index]!.name));
  await expectRows(0);

  const year = page.getByRole('button', { name: /^Año:/ });
  await year.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Año', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(year).toBeFocused();
  await choose(page, 'Año', String(historicalYear));
  await expectRows(3, 2, 1);

  await choose(page, 'Mes', 'Febrero');
  await expectRows(2, 1);
  await page.getByRole('button', { name: /^Fecha: más recientes primero/ }).click();
  await expectRows(1, 2);
  await choose(page, 'Registros por página: Compras registradas', '50');
  await page.reload();
  await expect(year).toHaveText(String(historicalYear));
  await expect(page.getByRole('button', { name: /^Mes:/ })).toHaveText('Febrero');
  await expect(page.getByRole('button', { name: /^Fecha: más antiguas primero/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Registros por página: Compras registradas:/ })).toHaveText('50');
  await expectRows(1, 2);
});

test('registrar a mano: guarda la fila con sugerencias, abre su ficha y muestra el estado de Sheets', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { sheetsSyncEnabled: true } } }));
  let state: 'pending' | 'error' | 'synced' = 'pending';
  await page.route('**/api/v1/purchases/sheets-sync*', route => route.fulfill({ json: { data: { status: state, pending: state === 'synced' ? 0 : 1, lastSyncedAt: state === 'synced' ? '2026-10-21T00:00:00.000Z' : null, url: 'https://docs.google.com/spreadsheets/d/fake_test_only/edit' } } }));
  await login(page, 'administrativo');
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  const number = 'MANUAL-' + crypto.randomUUID().slice(0, 8), field = (key: string) => page.locator(`#purchase-record-${key}`);
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  const errors = page.getByRole('region', { name: 'Revisa los datos de la compra', exact: true });
  await expect(errors.getByRole('heading')).toBeFocused();
  await errors.getByRole('link', { name: /^Monto\./ }).press('Enter');
  await expect(field('totalAmount')).toBeFocused();
  await field('requestNumber').fill(number);
  await field('totalAmount').fill('9007199254740993');
  // DETALLE con boleta y RUT al final: Cenit propone Tipo documento, bi, RUT y UNIDAD sin pisar lo escrito.
  await field('description').fill('HONORARIOS DOCENCIA FICTICIA, BOL/27, DEPTO SALUD PUBLICA_769182403');
  await expect(field('documentType')).toHaveValue('HONORARIOS');
  await expect(field('bi')).toHaveValue('27');
  await expect(field('rut')).toHaveValue('76.918.240-3');
  await expect(field('area')).toHaveValue('SALUD PUBLICA');
  // Pegar la cuenta completa en un código la separa en Unidad, Proyecto y Código Contable.
  await field('unitCode').fill('01.02.270101.00000000.410103');
  await expect(field('unitCode')).toHaveValue('270101');
  await expect(field('projectCode')).toHaveValue('00000000');
  await expect(field('accountingCode')).toHaveValue('410103');
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(`Solicitud ${number}`);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const saved = (await (await page.request.get(`/api/v1/purchases/${id}`)).json()).data;
  expect(saved.record).toMatchObject({ requestNumber: number, totalAmount: '9007199254740993', documentType: 'HONORARIOS', bi: '27', rut: '76918240-3', area: 'SALUD PUBLICA',
    unitCode: '270101', projectCode: '00000000', accountingCode: '410103', paymentSituation: 'PENDIENTE', document: 'SISTEMA DE COMPRAS' });
  const sync = sheet.getByRole('region', { name: 'Sincronización con Google Sheets', exact: true });
  await expect(sync).toContainText('Pendiente de sincronización');
  state = 'error'; await page.reload();
  await expect(sync).toContainText('Error de sincronización');
  state = 'synced'; await page.reload();
  await expect(sync.getByText('Sincronizado', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('También se retirará su copia de Google Sheets');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(sheet).toBeVisible();
});

test('fechas segmentadas: placeholders, errores, rangos y calendario coherentes', async ({ page }) => {
  await page.route('**/api/v1/purchases?**', async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), availableYears: [2026, 2024] } }); });
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const from = page.getByRole('textbox', { name: 'Rango de fechas: desde', exact: true });
  const fromMonth = page.getByRole('textbox', { name: 'Rango de fechas: desde, mes', exact: true });
  const fromYear = page.getByRole('textbox', { name: 'Rango de fechas: desde, año', exact: true });
  const to = page.getByRole('textbox', { name: 'Rango de fechas: hasta', exact: true });
  const toMonth = page.getByRole('textbox', { name: 'Rango de fechas: hasta, mes', exact: true });
  const toYear = page.getByRole('textbox', { name: 'Rango de fechas: hasta, año', exact: true });
  const clear = page.getByRole('button', { name: 'Limpiar', exact: true });
  const alert = page.locator('.purchase-input--date-range [role="alert"]');
  const queries: string[] = [];
  const fillDate = async (dayInput: typeof from, monthInput: typeof fromMonth, yearInput: typeof fromYear, digits: string) => {
    await dayInput.fill(''); await monthInput.fill(''); await yearInput.fill(digits.slice(4));
    await monthInput.fill(digits.slice(2, 4)); await dayInput.fill(digits.slice(0, 2));
  };
  // Un día exacto es el mismo día en ambos extremos.
  const fillDay = async (digits: string) => { await fillDate(from, fromMonth, fromYear, digits); await fillDate(to, toMonth, toYear, digits); };
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/purchases') queries.push(request.url()); });
  await expect(from).toBeEnabled();
  await expect(clear).toBeDisabled();
  const searchWidth = (await page.getByLabel('Buscar compras', { exact: true }).boundingBox())!.width;
  await page.locator('#purchase-more-filters').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  // Las dos fechas miden lo mismo y el guion queda al centro entre ellas.
  const [first, dash, second] = await Promise.all([from.locator('..').boundingBox(), page.locator('.purchase-range-control > span').boundingBox(), to.locator('..').boundingBox()]);
  expect(Math.abs((dash!.x - (first!.x + first!.width)) - (second!.x - (dash!.x + dash!.width)))).toBeLessThanOrEqual(1);
  await from.click();
  await from.pressSequentially('24');
  await expect(from).toHaveValue('24');
  await expect(fromMonth).toHaveValue(''); await expect(fromMonth).toHaveAttribute('placeholder', 'mm');
  await expect(fromYear).toHaveValue(''); await expect(fromYear).toHaveAttribute('placeholder', 'aaaa');
  expect((await page.getByLabel('Buscar compras', { exact: true }).boundingBox())!.width).toBeLessThanOrEqual(searchWidth);
  await expect(clear).toBeEnabled();
  await page.screenshot({ path: 'tmp/purchase-date-mask.png', animations: 'disabled' });
  await from.fill('24'); await fromMonth.fill('40');
  await expect(from).toHaveValue('24'); await expect(fromMonth).toHaveValue('');
  await expect(alert).toContainText('El mes');
  await fromYear.fill('2026');
  await expect(fromYear).toHaveValue('2026');
  await expect(from).toHaveAttribute('aria-invalid', 'true');
  await page.waitForTimeout(350); expect(queries).toHaveLength(0);
  await fillDay('29022024');
  await expect(page).toHaveURL(/dateFrom=2024-02-29&dateTo=2024-02-29/);
  await expect(from).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Actualizando resultados…', { exact: true })).toHaveCount(0);
  const count = queries.length;
  await fromMonth.fill('40');
  await expect(from).toHaveValue('29'); await expect(fromMonth).toHaveValue(''); await expect(fromYear).toHaveValue('2024');
  await expect(alert).toContainText('El mes');
  await fromYear.fill('1926');
  await expect(fromYear).toHaveValue('');
  await expect(alert).toContainText('El año');
  await fromYear.fill('2024'); await fromMonth.fill('02');
  await expect(page).toHaveURL(/dateFrom=2024-02-29&dateTo=2024-02-29/);
  const applied = page.url();
  await from.fill('32');
  await expect(from).toHaveValue(''); await expect(fromMonth).toHaveValue('02'); await expect(fromYear).toHaveValue('2024');
  await expect(alert).toContainText('El día');
  await fromYear.fill('2025'); await from.fill('29');
  await expect(from).toHaveValue(''); await expect(fromMonth).toHaveValue('02'); await expect(fromYear).toHaveValue('2025');
  await expect(alert).toContainText('El día');
  await page.waitForTimeout(350); expect(page.url()).toBe(applied); expect(queries.length).toBe(count);
  await fromYear.fill('2024'); await from.fill('29');
  await expect(page).toHaveURL(/dateFrom=2024-02-29&dateTo=2024-02-29/);

  await expect(page.getByText('Actualizando resultados…', { exact: true })).toHaveCount(0);
  const rangeQueryCount = queries.length;
  await fillDate(from, fromMonth, fromYear, '30102026');
  await expect(from).toHaveValue('30'); await expect(fromMonth).toHaveValue('10'); await expect(fromYear).toHaveValue('2026');
  await to.fill('24'); await toMonth.fill('40');
  await expect(to).toHaveValue('24'); await expect(toMonth).toHaveValue('');
  await expect(alert).toContainText('El mes');
  await toYear.fill('2026'); await expect(toYear).toHaveValue('2026');
  await expect(to).toHaveAttribute('aria-invalid', 'true');
  await page.waitForTimeout(350); expect(page.url()).toBe(applied); expect(queries.length).toBe(rangeQueryCount);
  await fillDate(to, toMonth, toYear, '29102026');
  await expect(alert).toBeVisible();
  await page.waitForTimeout(350); expect(page.url()).toBe(applied);
  await fillDate(to, toMonth, toYear, '03112026');
  await expect(page).toHaveURL(/dateFrom=2026-10-30&dateTo=2026-11-03/);
  await expect(clear).toHaveCount(1);
  await expect(page.locator('.purchase-filter-chips')).toHaveCount(0);
  const rangeTrigger = page.getByRole('button', { name: 'Abrir calendario: rango de fechas', exact: true });
  await rangeTrigger.hover();
  await expect.poll(() => rangeTrigger.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await rangeTrigger.click();
  const range = page.getByRole('dialog', { name: 'Calendario de rango de fechas', exact: true });
  // Cada mes del calendario trae su selector de mes y de año.
  await expect(range.getByRole('combobox', { name: 'Elegir el mes' })).toHaveCount(2);
  await expect(range.getByRole('combobox', { name: 'Elegir el año' })).toHaveCount(2);
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
  await expect(range.getByRole('combobox', { name: 'Elegir el mes' }).first()).toHaveValue('8');
  // Un rango largo se arma sin avanzar mes a mes: el primer mes a enero de 2024 y el segundo a diciembre de 2026.
  await range.getByRole('combobox', { name: 'Elegir el año' }).first().selectOption('2024');
  await range.getByRole('combobox', { name: 'Elegir el mes' }).first().selectOption('0');
  await day('2024-01-10').click();
  await range.getByRole('combobox', { name: 'Elegir el año' }).last().selectOption('2026');
  await range.getByRole('combobox', { name: 'Elegir el mes' }).last().selectOption('11');
  await expect(range.getByRole('combobox', { name: 'Elegir el mes' }).first()).toHaveValue('10');
  await day('2026-12-05').click();
  await expect(page).toHaveURL(/dateFrom=2024-01-10&dateTo=2026-12-05/);
  await expect(range.getByRole('combobox', { name: 'Elegir el año' }).first().locator('option')).toHaveText(['2026', '2025', '2024']);
  await page.keyboard.press('Escape'); await expect(range).toHaveCount(0); await expect(rangeTrigger).toBeFocused();
  await rangeTrigger.click(); await expect(range).toBeVisible();
  await rangeTrigger.click(); await expect(range).toHaveCount(0);
  await rangeTrigger.click(); await page.getByRole('heading', { name: 'Registro de compras', exact: true }).click(); await expect(range).toHaveCount(0);
  await clear.click(); await expect(clear).toBeDisabled(); await expect(from).toHaveValue(''); await expect(to).toHaveValue('');
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
  await fillDate(from, fromMonth, fromYear, '01012024'); await fillDate(to, toMonth, toYear, '31122024');
  await expect(page).toHaveURL(/dateFrom=2024-01-01&dateTo=2024-12-31/);
  await from.press('ControlOrMeta+a'); await from.press('Backspace');
  await to.press('ControlOrMeta+a'); await to.press('Backspace');
  await expect(from).toHaveValue(''); await expect(to).toHaveValue('');
  await expect(from).toHaveAttribute('placeholder', 'dd'); await expect(fromMonth).toHaveAttribute('placeholder', 'mm'); await expect(fromYear).toHaveAttribute('placeholder', 'aaaa');
  await expect(to).toHaveAttribute('placeholder', 'dd'); await expect(toMonth).toHaveAttribute('placeholder', 'mm'); await expect(toYear).toHaveAttribute('placeholder', 'aaaa');
  await expect(alert).toHaveCount(0);
  // Pegar una fecha llena los tres segmentos; borrar uno conserva los otros y los últimos resultados.
  await fillDate(to, toMonth, toYear, '24032026');
  await from.evaluate(element => {
    const clipboard = new DataTransfer(); clipboard.setData('text/plain', '24022026');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: clipboard }));
  });
  await expect(from).toHaveValue('24'); await expect(fromMonth).toHaveValue('02'); await expect(fromYear).toHaveValue('2026');
  await expect(page).toHaveURL(/dateFrom=2026-02-24&dateTo=2026-03-24/);
  const pastedUrl = page.url();
  await fromMonth.fill('');
  await expect(from).toHaveValue('24'); await expect(fromMonth).toHaveValue(''); await expect(fromYear).toHaveValue('2026');
  await page.waitForTimeout(350); expect(page.url()).toBe(pastedUrl);
  await fromMonth.fill('03');
  await expect(page).toHaveURL(/dateFrom=2026-03-24&dateTo=2026-03-24/);
  const correctedMonthUrl = page.url();
  await fromMonth.selectText(); await fromMonth.press('Backspace');
  await expect(from).toHaveValue('24'); await expect(fromMonth).toHaveValue(''); await expect(fromYear).toHaveValue('2026');
  await page.waitForTimeout(350); expect(page.url()).toBe(correctedMonthUrl);
  await fromMonth.fill('03'); await expect(page).toHaveURL(/dateFrom=2026-03-24&dateTo=2026-03-24/);
  await fromMonth.selectText(); await fromMonth.press('Delete');
  await expect(fromMonth).toHaveValue(''); await expect(from).toHaveValue('24'); await expect(fromYear).toHaveValue('2026');
  await fromMonth.fill('03'); await expect(page).toHaveURL(/dateFrom=2026-03-24&dateTo=2026-03-24/);
  await from.press('ControlOrMeta+a'); await from.press('Backspace');
  await expect(from).toHaveValue(''); await expect(fromMonth).toHaveValue(''); await expect(fromYear).toHaveValue('');
});

test('fechas del historial: vacío, metadata ausente, reintento y límites inclusivos', async ({ page }) => {
  let years: number[] | undefined = [];
  await page.route('**/api/v1/purchases?**', async route => {
    const response = await route.fetch(), data = await response.json();
    if (years?.length === 0) {
      data.data = [];
      data.pagination.total = 0;
    }
    await route.fulfill({ response, json: { ...data, availableYears: years } });
  });
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  await expect(page.getByRole('heading', { name: 'Aún no hay compras registradas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const from = page.getByRole('textbox', { name: 'Rango de fechas: desde', exact: true });
  const fromMonth = page.getByRole('textbox', { name: 'Rango de fechas: desde, mes', exact: true });
  const fromYear = page.getByRole('textbox', { name: 'Rango de fechas: desde, año', exact: true });
  const to = page.getByRole('textbox', { name: 'Rango de fechas: hasta', exact: true });
  const fill = async (day: typeof from, digits: string) => {
    const [, month, year] = await day.locator('..').getByRole('textbox').all();
    await day.fill(digits.slice(0, 2)); await month!.fill(digits.slice(2, 4)); await year!.fill(digits.slice(4));
  };
  await expect(from).toBeDisabled();
  await expect(page.getByText('Las fechas estarán disponibles cuando haya compras registradas.')).toBeVisible();
  years = undefined; await page.reload();
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await expect(page.getByText('No se pudieron cargar los años del historial.')).toBeVisible();
  years = [2026, 2024]; await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(from).toBeEnabled();
  const trigger = page.getByRole('button', { name: 'Abrir calendario: rango de fechas', exact: true });
  const calendar = page.getByRole('dialog', { name: 'Calendario de rango de fechas', exact: true });
  await fill(from, '01012024');
  await trigger.click();
  await expect(calendar.getByRole('button', { name: 'Ir al mes anterior' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await fill(from, '31122026');
  await trigger.click();
  await expect(calendar.getByRole('button', { name: 'Ir al mes siguiente' })).toBeDisabled();
  await page.keyboard.press('Escape');
  // A year without purchases inside the interval remains valid; empty parts remain native placeholders.
  await fill(from, '15062025'); await fill(to, '15062025'); await expect(page).toHaveURL(/dateFrom=2025-06-15&dateTo=2025-06-15/);
  await from.fill(''); await expect(from).toHaveValue(''); await expect(from).toHaveAttribute('placeholder', 'dd');
  await expect(fromMonth).toHaveValue('06'); await expect(fromYear).toHaveValue('2025');
  await from.fill('15'); await expect(from).toHaveValue('15'); await expect(fromMonth).toHaveValue('06'); await expect(fromYear).toHaveValue('2025');
  expect((await Promise.all([from.inputValue(), fromMonth.inputValue(), fromYear.inputValue()])).join('/')).not.toContain('_');
  await from.fill(''); await fromMonth.fill(''); await fromYear.fill('');
  await expect(from).toHaveValue(''); await expect(fromMonth).toHaveValue(''); await expect(fromYear).toHaveValue('');
});

test('filtros: distribución estable, teclado virtual, zoom equivalente y movimiento al diez por ciento', async ({ page }) => {
  await page.route('**/api/v1/purchases?**', async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), availableYears: [2026, 2024] } }); });
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  const search = page.getByLabel('Buscar compras', { exact: true }), clear = page.getByRole('button', { name: 'Limpiar', exact: true });
  const before = await clear.boundingBox(); await search.fill('FICTICIO'); await expect(clear).toBeEnabled();
  const after = await clear.boundingBox(); expect(after?.x).toBe(before?.x); expect(after?.width).toBe(before?.width);
  await clear.click(); await expect(clear).toBeDisabled();
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  const from = page.getByRole('textbox', { name: 'Rango de fechas: desde', exact: true });
  await expect(from).toBeEnabled(); await from.focus();
  await page.keyboard.insertText('24');
  await expect(from).toHaveValue('24');
  await expect(page.getByRole('textbox', { name: 'Rango de fechas: desde, mes', exact: true })).toHaveAttribute('placeholder', 'mm');
  await expect(page.getByRole('textbox', { name: 'Rango de fechas: desde, año', exact: true })).toHaveAttribute('placeholder', 'aaaa');
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
  await from.focus();
  const clip = await page.locator('.purchase-filter-extra__clip').boundingBox(), box = await page.locator('.purchase-range-control').boundingBox();
  expect(box!.x - clip!.x).toBeGreaterThanOrEqual(5); expect(clip!.x + clip!.width - box!.x - box!.width).toBeGreaterThanOrEqual(5);
});
