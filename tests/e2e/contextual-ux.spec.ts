import { test, expect, type Page, type Locator } from '@playwright/test';
import { credential, login, santiagoToday, selectRangeDay } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { dateLabel } from '../../apps/web/src/features/purchases/model/fields.js';

const dialog = (page: Page) => page.getByRole('alertdialog');
const sheet = (page: Page) => page.getByRole('dialog');
const list = (page: Page) => page.getByRole('region', { name: 'Compras registradas', exact: true });
const toolbar = (page: Page) => page.getByRole('button', { name: /^(Mostrar|Ocultar) navegación$/ });
const recordField = (page: Page, key: string) => page.locator(`#purchase-record-${key}`);
const pill = (page: Page, number: string) => list(page).getByRole('button', { name: new RegExp(`^Situación de pago de ${number}: `) });
async function fixtures(page: Page, count = 8, recordDate = santiagoToday()) {
  const prefix = `CTX-${crypto.randomUUID().slice(0, 8)}`;
  const records: { id: string; number: string }[] = [];
  for (let index = 0; index < count; index++) {
    const data = structuredClone(manualPurchaseExample); data.operationId = crypto.randomUUID();
    data.record.requestNumber = `${prefix}-${index}`;
    data.record.recordDate = recordDate;
    const response = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data });
    expect(response.status()).toBe(201);
    records.push({ id: (await response.json()).data.id, number: data.record.requestNumber });
  }
  await page.goto(`/administracion/compras?q=${prefix}`);
  await expect(list(page).getByRole('link', { name: /^Abrir la ficha de la compra / })).toHaveCount(count);
  return records;
}
async function insideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(15); expect(box!.y).toBeGreaterThanOrEqual(15);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 15);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 15);
}

test('Inicio y el «por pagar» reflejan altas, pago y eliminación sin recarga', async ({ page }) => {
  await login(page, 'administrativo');
  const home = async () => {
    if (await toolbar(page).getAttribute('aria-expanded') === 'false') await toolbar(page).click();
    await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  };
  const summary = async () => (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  const check = async (yearRequests: number, pendingCount: number, amount: string) => {
    await expect(page.locator('.home-figure--main .home-figure__detail')).toHaveText(new RegExp(`^${yearRequests} ${yearRequests === 1 ? 'compra' : 'compras'}( · \\d+ proyectos?)?$`));
    await expect.poll(async () => { const data = await summary(); return [data.pending, data.pendingAmount]; }).toEqual([pendingCount, amount]);
  };
  const before = await summary();
  const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(new Date(`${before.overview.registrationMonth}-01T12:00:00Z`));
  const beforeMonth = before.overview.monthlyTotals.find((month: { month: string }) => month.month === before.overview.registrationMonth).count;
  const monthRow = page.getByRole('table', { name: 'Monto por mes' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: monthName, exact: true }) });
  const number = `HOME-${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Registro de compras', exact: true }).click();
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  await recordField(page, 'requestNumber').fill(number);
  await recordField(page, 'recordDate').fill(dateLabel(before.overview.registrationMonth + '-15'));
  await recordField(page, 'description').fill('Solicitud ficticia para revisar el resumen');
  await recordField(page, 'totalAmount').fill('12345');
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(sheet(page)).toContainText(`Solicitud ${number}`);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  await sheet(page).getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await home();
  await check(before.overview.registeredThisYear + 1, before.pending + 1, (BigInt(before.pendingAmount) + 12345n).toString());
  await expect(monthRow.getByRole('cell').first()).toHaveText(String(beforeMonth + 1));
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'tmp/admin-home-connected-1280.png' });

  // Marcarla como pagada desde la fila la saca del «por pagar», sin cambiar el total del año.
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await page.getByLabel('Buscar compras', { exact: true }).fill(number);
  await pill(page, number).click();
  await expect(pill(page, number)).toHaveAccessibleName(`Situación de pago de ${number}: pagado. Volver a pendiente`);
  await home(); await check(before.overview.registeredThisYear + 1, before.pending, before.pendingAmount);
  await expect(monthRow.getByRole('cell').first()).toHaveText(String(beforeMonth + 1));

  // Eliminar sólo desde la ficha; al cerrar se conserva el listado filtrado.
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await page.getByLabel('Buscar compras', { exact: true }).fill(number);
  const open = list(page).getByRole('link', { name: `Abrir la ficha de la compra ${number}`, exact: true });
  await expect(open).toHaveAttribute('aria-disabled', 'false');
  await expect(list(page).getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0);
  await open.click();
  await sheet(page).getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(dialog(page)).toContainText('no se puede deshacer');
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/compras\\?q=${number}$`));
  expect((await page.request.get(`/api/v1/purchases/${id}`)).status()).toBe(404);
  await home(); await check(before.overview.registeredThisYear, before.pending, before.pendingAmount);

  // Los ejemplos de demostración también se eliminan desde su ficha.
  const example = structuredClone(manualPurchaseExample); example.operationId = crypto.randomUUID();
  example.origin = { type: 'contract_example', exampleId: 'recovered' }; example.record.requestNumber = `${number}-EXAMPLE`;
  example.record.recordDate = santiagoToday();
  expect((await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: example })).status()).toBe(201);
  await page.getByRole('link', { name: 'Ir a Compras', exact: true }).click();
  await page.getByLabel('Buscar compras', { exact: true }).fill(example.record.requestNumber);
  const exampleRow = list(page).getByRole('row').filter({ hasText: example.record.requestNumber });
  await expect(exampleRow.getByText('Ejemplo de demostración', { exact: true })).toBeVisible();
  await exampleRow.getByRole('link', { name: /^Abrir la ficha de la compra / }).click();
  const deleteButton = sheet(page).getByRole('button', { name: 'Eliminar', exact: true });
  await expect(deleteButton).toHaveText('');
  await deleteButton.click();
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/compras\\?q=${example.record.requestNumber}$`));
  await expect(exampleRow).toHaveCount(0);
  await home(); await check(before.overview.registeredThisYear, before.pending, before.pendingAmount);
  await page.reload(); await check(before.overview.registeredThisYear, before.pending, before.pendingAmount);
});

test('eliminar confirma, permite cancelar y conserva el registro ante conflicto hasta actualizar', async ({ page }) => {
  await login(page, 'administrativo');
  const record = (await fixtures(page, 1))[0]!;
  await list(page).getByRole('link', { name: /^Abrir la ficha de la compra / }).click();
  const trigger = sheet(page).getByRole('button', { name: 'Eliminar', exact: true });
  await expect(trigger).toHaveText('');
  await expect(trigger).toHaveAttribute('title', 'Eliminar registro');
  let deletes = 0; page.on('request', request => { if (request.method() === 'DELETE') deletes++; });
  await trigger.click(); await insideViewport(page, dialog(page));
  await expect(dialog(page)).toHaveCSS('opacity', '1');
  await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  // Escape cierra sólo la confirmación: la ficha sigue abierta y el foco vuelve al ícono.
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(trigger).toBeFocused(); expect(deletes).toBe(0);
  await expect(sheet(page)).toBeVisible();
  // Otra sesión la marca como pagada después de abrir la ficha: un borrado con la versión anterior no se aplica.
  await page.request.post(`/api/v1/purchases/${record.id}/payment-situation`, { headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: 1, paymentSituation: 'PAGADO' } });
  await trigger.click(); await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('El registro cambió');
  expect((await page.request.get(`/api/v1/purchases/${record.id}`)).status()).toBe(200);
  await expect(page.getByText('Registro eliminado', { exact: true })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Actualizar datos' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Volver a pendiente', exact: true })).toBeVisible();
  await trigger.click();
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\?q=CTX-/);
  await expect(page.getByRole('row').filter({ hasText: record.number })).toHaveCount(0);
  expect(deletes).toBe(2);
});

test('Inicio presenta carga y error con reintento sin mostrar cifras ficticias', async ({ page }) => {
  await login(page, 'administrativo');
  let release: (() => void) | undefined;
  await page.route('**/api/v1/purchases/summary', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Resumen temporalmente indisponible', requestId: 'summary-error' } }) });
  });
  await page.reload(); await expect(page.getByRole('status').filter({ hasText: 'Cargando resumen' })).toBeVisible();
  await expect(page.locator('.home-loading .home-figure')).toHaveCount(2);
  await expect(page.locator('.home-loading .home-rail__section')).toHaveCount(2);
  expect(await page.getByRole('definition').count()).toBe(0);
  await expect.poll(() => !!release).toBe(true); release!();
  await expect(page.getByRole('alert')).toContainText('Resumen temporalmente indisponible');
  await expect(page.getByRole('definition')).toHaveCount(0);
  await page.unroute('**/api/v1/purchases/summary');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  // Value and detail for the year and the month (the trend appears only with a previous month).
  await expect.poll(() => page.getByRole('definition').count()).toBeGreaterThanOrEqual(4);
});

test('confirmación contextual en la ficha: anclada al ícono, teclado, fondo y cancelación sin DELETE', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await login(page, 'administrativo'); await fixtures(page, 2);
  let deletes = 0; page.on('request', request => { if (request.method() === 'DELETE') deletes++; });
  await list(page).getByRole('link', { name: /^Abrir la ficha de la compra / }).first().click();
  const trigger = sheet(page).getByRole('button', { name: 'Eliminar', exact: true });
  // Con la confirmación abierta el resto de la ficha queda oculto para lectores de pantalla: se mide el ícono antes.
  const anchor = (await trigger.boundingBox())!;
  await trigger.click();
  // El ícono está al pie de la ficha: la confirmación se abre arriba de él, dentro de la ventana.
  await expect(dialog(page)).toHaveAttribute('data-side', 'top'); await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
  await insideViewport(page, dialog(page));
  const box = (await dialog(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(anchor.y);
  await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(dialog(page)).toBeVisible();
  await page.locator('.cenit-confirm-overlay').click({ position: { x: 3, y: 3 } });
  await expect(dialog(page)).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(sheet(page)).toBeVisible();
  expect(deletes).toBe(0);
});

test('pagar desde la fila espera al servidor, conserva un conflicto y no duplica el envío', async ({ page }) => {
  await login(page, 'administrativo'); const record = (await fixtures(page, 1))[0]!;
  const routePattern = `**/purchases/${record.id}/payment-situation`;
  let release: (() => void) | undefined; const bodies: unknown[] = [];
  await page.route(routePattern, async route => {
    bodies.push(route.request().postDataJSON()); await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'El registro cambió. Revisa su versión.', requestId: 'ctx-conflict' } }) });
  });
  const button = pill(page, record.number);
  await button.click();
  await expect(button).toBeDisabled(); await expect(button).toHaveText('Guardando…');
  await button.click({ force: true });
  await expect.poll(() => !!release).toBe(true);
  expect(bodies).toEqual([{ expectedVersion: 1, paymentSituation: 'PAGADO' }]);
  await expect(page.getByText('Compra marcada como pagada', { exact: true })).toHaveCount(0);
  release!();
  await expect(page.getByText('No se pudo cambiar la situación de pago', { exact: true })).toBeVisible();
  await expect(button).toHaveAccessibleName(`Situación de pago de ${record.number}: pendiente. Marcar como pagado`);
  expect((await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data.record.paymentSituation).toBe('PENDIENTE');
  await page.unroute(routePattern);
  await button.click();
  await expect(button).toHaveAccessibleName(`Situación de pago de ${record.number}: pagado. Volver a pendiente`);
  await expect(page.getByText('Compra marcada como pagada', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
});

test('sesión inválida desmonta la confirmación de inmediato e ignora el éxito tardío de otra identidad', async ({ page }) => {
  await login(page, 'administrativo'); const record = (await fixtures(page, 1))[0]!;
  let release: (() => void) | undefined;
  await page.route(`**/purchases/${record.id}`, async route => {
    if (route.request().method() !== 'DELETE') return route.continue();
    const response = await route.fetch(); await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ response });
  });
  await list(page).getByRole('link', { name: /^Abrir la ficha de la compra / }).click();
  await sheet(page).getByRole('button', { name: 'Eliminar', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  const other = credential('docente');
  await page.request.post('/api/v1/auth/login', { headers: { Origin: new URL(page.url()).origin }, data: { email: other.email, password: other.password } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/academico$/); await expect(dialog(page)).toHaveCount(0); await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.cenit-confirm-overlay')).toHaveCount(0); release!();
  await expect(page.getByRole('heading', { name: 'Malla curricular' })).toBeVisible();
  await expect(page.getByText('Registro eliminado', { exact: true })).toHaveCount(0);
});

test('descarte usa el origen explícito, atrás usa la cabecera visible y cerrar no deja acciones invisibles', async ({ page }) => {
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  await recordField(page, 'requestNumber').fill('BORRADOR-CONTEXTUAL');
  await recordField(page, 'provider').fill('Proveedor ficticio');
  const back = page.getByRole('link', { name: 'Volver al registro', exact: true }); await back.click();
  await insideViewport(page, dialog(page));
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0); await expect(back).toBeFocused();
  await page.goBack(); await insideViewport(page, dialog(page));
  await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.locator('[data-confirm-fallback]')).toBeFocused();
  await expect(recordField(page, 'requestNumber')).toHaveValue('BORRADOR-CONTEXTUAL');
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/administracion$/); await expect(page.locator('#admin-content')).toBeFocused();
});

test('una búsqueda sin resultados en el año elegido ofrece buscar en todos los años y conserva el foco', async ({ page }) => {
  await login(page, 'administrativo');
  const year = Number(santiagoToday().slice(0, 4)), number = `ANIOS-${crypto.randomUUID().slice(0, 8)}`;
  const record = structuredClone(manualPurchaseExample); record.operationId = crypto.randomUUID();
  record.record.requestNumber = number; record.record.recordDate = `${year - 1}-03-10`;
  expect((await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: record })).status()).toBe(201);
  await page.goto(`/administracion/compras?q=${number}`);
  await expect(list(page).getByText(`Sólo se buscó en ${year}. Prueba en todos los años o con otro número o código.`, { exact: true })).toBeVisible();
  await list(page).getByRole('button', { name: 'Buscar en todos los años', exact: true }).click();
  await expect(page).toHaveURL(/allYears=1/);
  await expect(list(page).getByRole('row').filter({ hasText: number })).toHaveCount(1);
  await expect(list(page).getByRole('heading', { name: 'Compras registradas', exact: true })).toBeFocused();
  await page.reload();
  await expect(list(page).getByRole('row').filter({ hasText: number })).toHaveCount(1);
});

test('filtros vacíos, repetidos y quitados no generan consultas ni historial redundantes', async ({ page }) => {
  await login(page, 'administrativo'); await fixtures(page, 1); await page.goto('/administracion'); await page.goto('/administracion/compras');
  await expect(list(page).getByRole('table')).toBeVisible();
  let queries = 0; page.on('request', r => { if (new URL(r.url()).pathname === '/api/v1/purchases') queries++; });
  const search = page.getByLabel('Buscar compras', { exact: true });
  const history = await page.evaluate(() => window.history.length);
  await page.clock.install(); await search.fill('   '); await page.clock.runFor(300);
  await expect(page.getByRole('button', { name: 'Limpiar', exact: true })).toBeDisabled();
  expect(queries).toBe(0); expect(await page.evaluate(() => window.history.length)).toBe(history);
  await search.fill('FILTRO-CONTEXTUAL'); await page.clock.runFor(300); await page.clock.resume();
  await expect(page).toHaveURL(/q=FILTRO-CONTEXTUAL/);
  await expect(list(page).getByText('No encontramos compras con estos filtros')).toBeVisible();
  const appliedQueries = queries;
  await search.fill(' FILTRO-CONTEXTUAL '); await page.clock.runFor(300);
  expect(queries).toBe(appliedQueries);
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await page.clock.runFor(300); await expect(page).toHaveURL(/\/compras$/);
  await expect(page.locator('.purchase-filter-chips')).toHaveCount(0);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await page.clock.resume(); await page.goBack(); await expect(page).toHaveURL(/\/administracion$/);
  await page.goForward(); await expect(search).toHaveValue('');
});

test('filtros automáticos aplican un día específico, agrupan escritura y conservan foco', async ({ page }) => {
  const recordDate = santiagoToday();
  await login(page, 'administrativo'); const records = await fixtures(page, 2, recordDate);
  await page.goto('/administracion/compras?page=2');
  await expect(page.getByText(/^Página 2 de /)).toHaveCount(1);
  const prefix = records[0]!.number.slice(0, -2), search = page.getByLabel('Buscar compras', { exact: true });
  const history = await page.evaluate(() => window.history.length), queries: URL[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/v1/purchases') queries.push(url); });
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir calendario: rango de fechas', exact: true }).click();
  await selectRangeDay(page, recordDate);
  await page.clock.runFor(249);
  expect(queries).toHaveLength(0); await page.clock.runFor(1); await page.clock.resume();
  const period = `dateFrom=${recordDate}&dateTo=${recordDate}`;
  await expect(page).toHaveURL(new RegExp(`${period}$`));
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await page.keyboard.press('Escape');
  queries.length = 0;
  await search.fill(prefix);
  await expect(page).toHaveURL(new RegExp(`q=${prefix}&${period}$`));
  await expect.poll(() => queries.length).toBe(1);
  await expect(page.getByText(/^Página 1 de /)).toHaveCount(1);
  for (const query of queries) { expect(query.searchParams.get('q')).toBe(prefix); expect(query.searchParams.get('dateFrom')).toBe(recordDate); expect(query.searchParams.get('dateTo')).toBe(recordDate); }
  await expect(search).toBeFocused();
  await expect(list(page).getByText('2 registros', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await page.getByLabel('Unidad', { exact: true }).fill('999999');
  await expect(list(page).getByText('No encontramos compras con estos filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/); await page.reload(); await expect(search).toHaveValue('');
});

test('búsqueda en vivo descarta respuestas anteriores y conserva el filtro al cerrar la ficha', async ({ page }) => {
  await login(page, 'administrativo'); const records = await fixtures(page, 2);
  const search = page.getByLabel('Buscar compras', { exact: true });
  let release: (() => void) | undefined;
  await page.route('**/api/v1/purchases?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('q') !== records[0]!.number) return route.continue();
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response }).catch(() => {});
  });
  await search.fill(records[0]!.number); await expect.poll(() => !!release).toBe(true);
  await search.fill(records[1]!.number);
  const current = list(page).getByRole('row').filter({ hasText: records[1]!.number });
  await expect(current).toBeVisible(); release!();
  await expect(list(page).getByRole('row').filter({ hasText: records[0]!.number })).toHaveCount(0);
  await current.getByRole('link', { name: /^Abrir la ficha de la compra / }).click();
  await sheet(page).getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(search).toHaveValue(records[1]!.number);
  await expect(current).toBeVisible();
  await page.reload(); await expect(search).toHaveValue(records[1]!.number);
  await expect(current).toBeVisible();
});

test('cambiar filtros reinicia páginas, limpiar evita duplicados y el no cambio conserva error/reintento', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras?q=CONTEXTUAL-PAGES&page=2');
  await page.getByLabel('Buscar compras', { exact: true }).fill('CONTEXTUAL-UPDATED');
  await expect(page).toHaveURL(/compras\?q=CONTEXTUAL-UPDATED$/);
  // Sin resultados no hay paginación; el vacío ofrece quitar los filtros.
  await expect(page.getByText('No encontramos compras con estos filtros', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Quitar filtros', exact: true })).toHaveCount(1);
  await expect(page.getByText(/^Página \d+ de /)).toHaveCount(0);
  await page.route('**/api/v1/purchases?**', route => route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente indisponible', requestId: 'ctx-filters' } } }));
  await page.goto('/administracion/compras?q=CONTEXTUAL-ERROR');
  await expect(list(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.getByLabel('Buscar compras', { exact: true }).fill(' CONTEXTUAL-ERROR ');
  await expect(list(page).getByRole('alert')).toContainText('Servicio temporalmente indisponible');
  await page.unroute('**/api/v1/purchases?**'); await list(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(list(page).getByText('No encontramos compras con estos filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click(); await expect(page).toHaveURL(/\/compras$/);
  await expect(page.getByRole('button', { name: 'Limpiar', exact: true })).toBeDisabled();
});

test('marco y navegación permanecen visibles al desplazar listas y formularios', async ({ page }) => {
  await login(page, 'administrativo'); await fixtures(page);
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.locator('#admin-content').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await insideViewport(page, toolbar(page));
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
    expect(await page.locator('.workspace-shell').evaluate(e => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(height - 15);
    expect(await page.locator('.purchase-table-scroll').first().evaluate(e => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
  }
  await page.getByRole('link', { name: 'Registrar a mano', exact: true }).click();
  expect(await page.locator('#admin-content').evaluate(e => e.scrollTop)).toBe(0); await expect(page.locator('#admin-content')).toBeFocused();
  for (const [width, height] of [[1280, 720]] as const) {
    await page.setViewportSize({ width, height });
    const field = recordField(page, 'document'); await field.focus(); await field.fill('SISTEMA DE COMPRAS DEMO');
    await expect.poll(async () => { const box = (await field.boundingBox())!; return box.y > 55 && box.y + box.height < height; }, { message: `Campo enfocado visible en ${width}×${height}` }).toBe(true);
    await page.getByRole('link', { name: 'Volver al registro', exact: true }).click(); await insideViewport(page, dialog(page));
    await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(toolbar(page)).toBeVisible();
  }
});

test('reapertura durante salida, ancla retirada y movimiento reducido conservan foco e identidad', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'administrativo'); await fixtures(page, 2);
  let deletes = 0; page.on('request', request => { if (request.method() === 'DELETE') deletes++; });
  await list(page).getByRole('link', { name: /^Abrir la ficha de la compra / }).first().click();
  const trigger = sheet(page).getByRole('button', { name: 'Eliminar', exact: true });
  const handle = (await trigger.elementHandle())!;
  await trigger.click(); const name = await dialog(page).getByRole('heading').textContent();
  await page.keyboard.press('Escape');
  // Dispatch during the interrupted 150 ms exit to reopen deterministically.
  await handle.dispatchEvent('click');
  await expect(dialog(page).getByRole('heading')).toHaveText(name!);
  await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  expect(await dialog(page).evaluate(e => ({ filter: getComputedStyle(e).filter, translate: getComputedStyle(e).translate }))).toEqual({ filter: 'none', translate: 'none' });
  // Simulate detachment before React receives an external update.
  await handle.evaluate(e => e.remove());
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0); expect(deletes).toBe(0);
  await expect(sheet(page).getByRole('heading', { level: 2 })).toBeFocused();
});

test('navegación: ancho fijo del contenido durante apertura/cierre, inversión', async ({ page }) => {
  await login(page, 'administrativo');
  const content = page.locator('.workspace-sidebar .workspace-sidebar-content');
  const label = page.locator('.workspace-sidebar a[href="/administracion/compras"] span');
  const dimensions = () => label.evaluate(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
  const before = await dimensions();
  const expectStableDimensions = async () => {
    const current = await dimensions();
    // Animated transforms can introduce floating-point noise in DOMRect values.
    expect(Math.abs(current.width - before.width)).toBeLessThan(0.01);
    expect(Math.abs(current.height - before.height)).toBeLessThan(0.01);
  };
  for (let index = 0; index < 3; index++) {
    await toolbar(page).click();
    // Replay the CSS transitions at 10% speed to inspect stable text geometry mid-flight.
    await page.evaluate(() => document.getAnimations().forEach(animation => animation.updatePlaybackRate(.1)));
    await expect(content).toHaveCSS('width', '220px'); await expectStableDimensions();
    await toolbar(page).click();
    await page.evaluate(() => document.getAnimations().forEach(animation => animation.updatePlaybackRate(1)));
    await expect(toolbar(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toHaveCSS('width', '220px'); await expectStableDimensions();
  }
  await page.goto('/administracion/compras');
  const manual = page.getByRole('link', { name: 'Registrar a mano', exact: true }), capture = page.getByRole('link', { name: 'Registrar capturas', exact: true });
  expect((await manual.boundingBox())!.height).toBe((await capture.boundingBox())!.height);
  expect((await capture.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
