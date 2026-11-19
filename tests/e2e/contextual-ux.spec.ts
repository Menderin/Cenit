import { test, expect, type Page, type Locator } from '@playwright/test';
import { credential, login, selectCalendarDate } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import { amountLabel, dateLabel } from '../../apps/web/src/features/purchases/model/fields.js';

test('Inicio refleja altas, validación y eliminación de pendientes y validados sin recarga', async ({ page }) => {
  await login(page, 'administrativo');
  const home = async () => {
    if (await toolbar(page).getAttribute('aria-expanded') === 'false') await toolbar(page).click();
    await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  };
  const summary = async () => (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  const check = async (yearRequests: number, pendingCount: number, amount: string) => {
    await expect(page.locator('.dashboard-kpis dd').first()).toHaveText(String(yearRequests));
    const review = page.getByRole('region', { name: 'Segunda revisión' });
    await expect(review).toContainText(String(pendingCount));
    await expect(review).toContainText(amountLabel(amount));
  };
  const before = await summary();
  const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(new Date(`${before.overview.registrationMonth}-01T12:00:00Z`));
  const beforeMonth = before.overview.monthlyTotals.find((month: { month: string }) => month.month === before.overview.registrationMonth).count;
  const monthRow = page.getByRole('table', { name: 'Monto documental por mes de envío' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: monthName, exact: true }) });
  const number = `HOME-${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  await page.getByRole('link', { name: 'Registrar manualmente', exact: true }).click();
  await page.getByLabel('Nº Documento / solicitud *', { exact: true }).fill(number);
  await page.getByLabel('Fecha de envío *', { exact: true }).fill(dateLabel(before.overview.registrationMonth + '-15'));
  await page.getByLabel('Descripción *', { exact: true }).fill('Solicitud ficticia para revisar el resumen');
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Solicitud ${number}` })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  await home();
  await check(before.overview.registeredThisYear + 1, before.pending + 1, (BigInt(before.pendingAmount) + 12345n).toString());
  await expect(monthRow.getByRole('cell').first()).toHaveText(String(beforeMonth + 1));
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'tmp/admin-home-connected-1280.png' });
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(number);

  const row = pending(page).getByRole('row').filter({ hasText: number });
  await row.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(row).toHaveCount(0);
  await home(); await check(before.overview.registeredThisYear + 1, before.pending, before.pendingAmount);
  await expect(monthRow.getByRole('cell').first()).toHaveText(String(beforeMonth + 1));
  // Delete a reviewed record through its detail; the filtered list is preserved on return.
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(number);

  const reviewedDetail = page.getByRole('region', { name: 'Revisados en Cenit', exact: true }).getByRole('row').filter({ hasText: number }).getByRole('link', { name: `Ver detalles de ${number}`, exact: true });
  await expect(reviewedDetail).toHaveAttribute('aria-disabled', 'false');
  await reviewedDetail.click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(dialog(page)).toContainText('no se puede deshacer');
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/compras\\?q=${number}$`));
  expect((await page.request.get(`/api/v1/purchases/${id}`)).status()).toBe(404);
  await home(); await check(before.overview.registeredThisYear, before.pending, before.pendingAmount);
  // Pending examples also require opening the detail before deleting.
  const example = structuredClone(manualPurchaseExample); example.operationId = crypto.randomUUID();
  example.origin = { type: 'contract_example', exampleId: 'recovered' }; example.header.requestNumber = `${number}-PENDING`;
  const response = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: example });
  expect(response.status()).toBe(201);
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(example.header.requestNumber);

  const exampleRow = pending(page).getByRole('row').filter({ hasText: example.header.requestNumber });
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0);
  await exampleRow.getByRole('link', { name: 'Ver detalles' }).click();
  const deleteButton = page.getByRole('button', { name: 'Eliminar', exact: true });
  await expect(deleteButton).toHaveText('');
  await deleteButton.click();
  await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/compras\\?q=${example.header.requestNumber}$`));
  await expect(exampleRow).toHaveCount(0);
  await home(); await check(before.overview.registeredThisYear, before.pending, before.pendingAmount);
  await page.reload(); await check(before.overview.registeredThisYear, before.pending, before.pendingAmount);
});

test('eliminar confirma, permite cancelar y conserva el registro ante conflicto hasta actualizar', async ({ page }) => {
  await login(page, 'administrativo');
  const record = (await fixtures(page, 1))[0]!;
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0);
  await pending(page).getByRole('link', { name: 'Ver detalles' }).click();
  const trigger = page.getByRole('button', { name: 'Eliminar', exact: true });
  await expect(trigger).toHaveText('');
  await expect(trigger).toHaveAttribute('title', 'Eliminar registro');
  await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
  let deletes = 0; page.on('request', request => { if (request.method() === 'DELETE') deletes++; });
  await trigger.click(); await insideViewport(page, dialog(page));
  await expect(dialog(page)).toHaveCSS('opacity', '1');
  await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(trigger).toBeFocused(); expect(deletes).toBe(0);
  // Another session validates after the table was loaded. A stale delete must not succeed.
  await page.request.post(`/api/v1/purchases/${record.id}/validation`, { headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: 1 } });
  await trigger.click(); await dialog(page).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('El registro cambió');
  expect((await page.request.get(`/api/v1/purchases/${record.id}`)).status()).toBe(200);
  await expect(page.getByText('Registro eliminado', { exact: true })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Actualizar datos' }).click();
  await expect(page.getByText('Revisado en Cenit', { exact: true })).toBeVisible();
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
  await expect(page.locator('.dashboard-loading .dashboard-kpis > div')).toHaveCount(3);
  await expect(page.locator('.dashboard-loading .dashboard-card')).toHaveCount(3);
  expect(await page.getByRole('definition').count()).toBe(0);
  await expect.poll(() => !!release).toBe(true); release!();
  await expect(page.getByRole('alert')).toContainText('Resumen temporalmente indisponible');
  await expect(page.getByRole('definition')).toHaveCount(0);
  await page.unroute('**/api/v1/purchases/summary');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('definition')).toHaveCount(6);
});

const dialog = (page: Page) => page.getByRole('alertdialog');
const pending = (page: Page) => page.getByRole('region', { name: 'Por revisar en Cenit', exact: true });
const toolbar = (page: Page) => page.getByRole('button', { name: /^(Mostrar|Ocultar) navegación$/ });
async function fixtures(page: Page, count = 8) {
  const prefix = `CTX-${crypto.randomUUID().slice(0, 8)}`;
  const records: { id: string; number: string }[] = [];
  for (let index = 0; index < count; index++) {
    const data = structuredClone(manualPurchaseExample); data.operationId = crypto.randomUUID();
    data.header.requestNumber = `${prefix}-${index}`;
    const response = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data });
    expect(response.status()).toBe(201);
    records.push({ id: (await response.json()).data.id, number: data.header.requestNumber });
  }
  await page.goto(`/administracion/compras?q=${prefix}`);
  await expect(pending(page).getByRole('button', { name: 'Validar registro', exact: true })).toHaveCount(count);
  return records;
}
async function insideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(15); expect(box!.y).toBeGreaterThanOrEqual(15);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 15);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 15);
}

test('confirmación contextual: arriba/abajo, última fila, portal, teclado, fondo y cancelación sin POST', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await login(page, 'administrativo'); await fixtures(page);
  let posts = 0; page.on('request', request => { if (request.url().endsWith('/validation')) posts++; });
  const trigger = pending(page).getByRole('button', { name: 'Validar registro', exact: true }).last();
  await trigger.click();
  await expect(dialog(page)).toHaveAttribute('data-side', 'top'); await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
  await insideViewport(page, dialog(page));
  await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog(page).getByRole('button', { name: 'Validar registro', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  const before = await page.locator('#admin-content').evaluate(e => e.scrollTop);
  await page.mouse.move(500, 400); await page.mouse.wheel(0, -500); await page.keyboard.press('PageDown');
  await expect.poll(() => page.locator('#admin-content').evaluate(e => e.scrollTop)).toBe(before);
  await expect(page.locator('.admin-workspace')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(dialog(page)).toBeVisible();
  await page.locator('.cenit-confirm-overlay').click({ position: { x: 3, y: 3 } });
  await expect(dialog(page)).toHaveCount(0); await expect(trigger).toBeFocused();
  const first = pending(page).getByRole('button', { name: 'Validar registro', exact: true }).first();
  await first.evaluate(e => { const main = document.querySelector('#admin-content')!; main.scrollTop += e.getBoundingClientRect().top - 110; });
  await first.click(); await expect(dialog(page)).toHaveAttribute('data-side', 'bottom'); await insideViewport(page, dialog(page));
  await dialog(page).getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  expect(posts).toBe(0);
});

test('validar espera servidor, conserva conflicto, evita duplicados y retorna foco tras desaparecer fila y acción de detalle', async ({ page }) => {
  await login(page, 'administrativo'); const record = (await fixtures(page, 1))[0]!;
  const routePattern = `**/purchases/${record.id}/validation`;
  let release: (() => void) | undefined; const bodies: unknown[] = [];
  await page.route(routePattern, async route => {
    bodies.push(route.request().postDataJSON()); await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'El registro cambió. Revisa su versión.', requestId: 'ctx-conflict' } }) });
  });
  await pending(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Validando…' })).toBeDisabled();
  await page.keyboard.press('Escape'); await page.locator('.cenit-confirm-overlay').click({ position: { x: 3, y: 3 } });
  await expect(dialog(page)).toBeVisible(); await expect(page.getByText('Registro validado', { exact: true })).toHaveCount(0);
  expect(bodies).toEqual([{ expectedVersion: 1 }]); release!();
  await expect(dialog(page).getByRole('alert')).toContainText('El registro cambió');
  await page.unroute(routePattern);
  await page.evaluate(() => {
    let start: number | undefined;
    const observer = new MutationObserver(() => {
      if (document.querySelector('.cenit-confirm.cenit-closing')) start ??= performance.now();
      if (!document.querySelector('.cenit-confirm')) {
        document.body.dataset.confirmExitDuration = String(start === undefined ? 0 : performance.now() - start);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(pending(page).getByRole('row').filter({ hasText: record.number })).toHaveCount(0);
  await expect(pending(page).getByRole('heading', { name: 'Por revisar en Cenit' })).toBeFocused();
  await expect(page.getByText('Registro validado', { exact: true })).toBeVisible();
  expect(Number(await page.locator('body').getAttribute('data-confirm-exit-duration'))).toBeGreaterThanOrEqual(130);
  const detail = (await fixtures(page, 1))[0]!; await page.goto(`/administracion/compras/${detail.id}`);
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.getByText('Revisado en Cenit', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Solicitud ${detail.number}` })).toBeFocused();
});

test('sesión inválida desmonta la confirmación de inmediato e ignora éxito tardío de otra identidad', async ({ page }) => {
  await login(page, 'administrativo'); const record = (await fixtures(page, 1))[0]!;
  let release: (() => void) | undefined;
  await page.route(`**/purchases/${record.id}/validation`, async route => {
    const response = await route.fetch(); await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ response });
  });
  await pending(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  const other = credential('docente');
  await page.request.post('/api/v1/auth/login', { headers: { Origin: new URL(page.url()).origin }, data: { email: other.email, password: other.password } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/academico$/); await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.cenit-confirm-overlay')).toHaveCount(0); release!();
  await expect(page.getByRole('heading', { name: 'Malla curricular' })).toBeVisible();
  await expect(page.getByText('Registro validado', { exact: true })).toHaveCount(0);
});

test('descarte usa origen explícito, atrás usa cabecera visible y cerrar no deja acciones invisibles', async ({ page }) => {
  await login(page, 'administrativo'); await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Registrar manualmente', exact: true }).click();
  await page.getByLabel('Nº Documento / solicitud *', { exact: true }).fill('BORRADOR-CONTEXTUAL');
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Proveedor · ítem 1', { exact: true }).fill('Proveedor ficticio');
  const cancel = page.getByRole('button', { name: 'Cancelar', exact: true }); await cancel.click();
  await expect(dialog(page)).toHaveAttribute('data-side', 'top'); await insideViewport(page, dialog(page));
  await page.keyboard.press('Escape');
  await expect(dialog(page).getByRole('button', { name: 'Descartar y salir' })).toBeDisabled();
  await expect(dialog(page)).toHaveCount(0); await expect(cancel).toBeFocused();
  await cancel.click(); await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  await page.goBack(); await insideViewport(page, dialog(page));
  await expect(dialog(page)).toHaveAttribute('data-side', 'bottom');
  await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.locator('[data-confirm-fallback]')).toBeFocused();
  await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue('BORRADOR-CONTEXTUAL');
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/administracion$/); await expect(page.locator('#admin-content')).toBeFocused();
});

test('filtros vacíos, repetidos y quitados no generan consultas ni historial redundantes', async ({ page }) => {
  await login(page, 'administrativo'); await fixtures(page, 1); await page.goto('/administracion'); await page.goto('/administracion/compras');
  await expect(pending(page).getByRole('table')).toBeVisible();
  let queries = 0; page.on('request', r => { if (new URL(r.url()).pathname === '/api/v1/purchases') queries++; });
  const search = page.getByLabel('Buscar solicitudes', { exact: true });
  const history = await page.evaluate(() => window.history.length);
  await page.clock.install(); await search.fill('   '); await page.clock.runFor(300);
  await expect(page.getByRole('button', { name: 'Limpiar', exact: true })).toBeDisabled();
  expect(queries).toBe(0); expect(await page.evaluate(() => window.history.length)).toBe(history);
  await search.fill('FILTRO-CONTEXTUAL'); await page.clock.runFor(300); await page.clock.resume();
  await expect(page).toHaveURL(/q=FILTRO-CONTEXTUAL/);
  await expect(pending(page).getByText('No encontramos compras con estos filtros')).toBeVisible();
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
  await login(page, 'administrativo'); const records = await fixtures(page, 2);
  await page.request.post(`/api/v1/purchases/${records[1]!.id}/validation`, { headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: 1 } });
  await page.goto('/administracion/compras?pendingPage=2&reviewedPage=2');
  await expect(page.getByText(/^Página 2 de /)).toHaveCount(2);
  const prefix = records[0]!.number.slice(0, -2), search = page.getByLabel('Buscar solicitudes', { exact: true });
  const history = await page.evaluate(() => window.history.length), queries: URL[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/v1/purchases') queries.push(url); });
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir calendario: Fecha de envío', exact: true }).click();
  await selectCalendarDate(page, '2026-10-12');
  await page.clock.runFor(249);
  expect(queries).toHaveLength(0); await page.clock.runFor(1); await page.clock.resume();
  await expect(page).toHaveURL(/dateFrom=2026-10-12&dateTo=2026-10-12$/);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await page.keyboard.press('Escape');
  queries.length = 0;
  await search.fill(prefix);
  await expect(page).toHaveURL(new RegExp(`q=${prefix}&dateFrom=2026-10-12&dateTo=2026-10-12$`));
  await expect.poll(() => queries.length).toBe(2);
  await expect(page.getByText(/^Página 1 de /)).toHaveCount(2);
  for (const query of queries) { expect(query.searchParams.get('q')).toBe(prefix); expect(query.searchParams.get('dateFrom')).toBe('2026-10-12'); expect(query.searchParams.get('dateTo')).toBe('2026-10-12'); }
  await expect(search).toBeFocused();
  await expect(pending(page).getByText('1 registro', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Revisados en Cenit', exact: true }).getByText('1 registro', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await page.getByLabel('Código de unidad', { exact: true }).fill('SIN-COINCIDENCIA');
  await expect(pending(page).getByText('No encontramos compras con estos filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/); await page.reload(); await expect(search).toHaveValue('');
});

test('búsqueda en vivo descarta respuestas anteriores y conserva el filtro al volver del detalle', async ({ page }) => {
  await login(page, 'administrativo'); const records = await fixtures(page, 2);
  const search = page.getByLabel('Buscar solicitudes', { exact: true });
  let release: (() => void) | undefined;
  await page.route('**/api/v1/purchases?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('q') !== records[0]!.number || query.get('reviewStatus') !== 'pending') return route.continue();
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response }).catch(() => {});
  });
  await search.fill(records[0]!.number); await expect.poll(() => !!release).toBe(true);
  await search.fill(records[1]!.number);
  const current = pending(page).getByRole('row').filter({ hasText: records[1]!.number });
  await expect(current).toBeVisible(); release!();
  await expect(pending(page).getByRole('row').filter({ hasText: records[0]!.number })).toHaveCount(0);
  await current.getByRole('link', { name: 'Ver detalles' }).click();
  await page.getByRole('link', { name: 'Volver al registro' }).click();
  await expect(search).toHaveValue(records[1]!.number);
  await expect(current).toBeVisible();
  await page.reload(); await expect(search).toHaveValue(records[1]!.number);
  await expect(current).toBeVisible();
});

test('cambiar filtros reinicia páginas, limpiar evita duplicados y el no cambio conserva error/reintento', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras?q=CONTEXTUAL-PAGES&pendingPage=2&reviewedPage=2');
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('CONTEXTUAL-UPDATED');
  await expect(page).toHaveURL(/compras\?q=CONTEXTUAL-UPDATED$/);
  // Sin resultados no hay paginación; el vacío ofrece quitar los filtros en ambas tablas.
  await expect(page.getByText('No encontramos compras con estos filtros', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Quitar filtros', exact: true })).toHaveCount(2);
  await expect(page.getByText(/^Página \d+ de /)).toHaveCount(0);
  await page.route('**/api/v1/purchases?**', route => route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente indisponible', requestId: 'ctx-filters' } } }));
  await page.goto('/administracion/compras?q=CONTEXTUAL-ERROR');
  await expect(pending(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(' CONTEXTUAL-ERROR ');
  await expect(pending(page).getByRole('alert')).toContainText('Servicio temporalmente indisponible');
  await page.unroute('**/api/v1/purchases?**'); await pending(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(pending(page).getByText('No encontramos compras con estos filtros')).toBeVisible();
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
  await page.getByRole('link', { name: 'Registrar manualmente', exact: true }).click();
  expect(await page.locator('#admin-content').evaluate(e => e.scrollTop)).toBe(0); await expect(page.locator('#admin-content')).toBeFocused();
  for (const [width, height] of [[1280, 720]] as const) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    const field = page.getByLabel(/Proveedor · ítem/).last(); await field.focus(); await field.fill('Foco visible');
    await expect.poll(async () => { const box = (await field.boundingBox())!, footer = (await page.locator('.purchase-form-footer').boundingBox())!; return box.y > 55 && box.y + box.height < Math.min(height, footer.y); }, { message: `Campo enfocado visible y sobre las acciones en ${width}×${height}` }).toBe(true);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await insideViewport(page, dialog(page));
    await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(toolbar(page)).toBeVisible();
  }
});

test('reapertura durante salida, ancla retirada y movimiento reducido conservan foco e identidad', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'administrativo'); await fixtures(page, 2);
  let posts = 0; page.on('request', request => { if (request.url().endsWith('/validation')) posts++; });
  const trigger = pending(page).getByRole('button', { name: 'Validar registro', exact: true }).first();
  const handle = (await trigger.elementHandle())!;
  await trigger.click(); const name = await dialog(page).getByRole('heading').textContent();
  await page.keyboard.press('Escape');
  // Dispatch while inert to exercise the interrupted 150 ms exit deterministically.
  await handle.dispatchEvent('click');
  await expect(dialog(page).getByRole('heading')).toHaveText(name!);
  await expect(dialog(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  expect(await dialog(page).evaluate(e => ({ filter: getComputedStyle(e).filter, translate: getComputedStyle(e).translate }))).toEqual({ filter: 'none', translate: 'none' });
  // Simulate detachment before React receives an external list update.
  await handle.evaluate(e => e.remove());
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0); expect(posts).toBe(0);
  await expect(pending(page).getByRole('heading', { name: 'Por revisar en Cenit' })).toBeFocused();
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
  const manual = page.getByRole('link', { name: 'Registrar manualmente', exact: true }), capture = page.getByRole('link', { name: 'Subir captura', exact: true });
  expect((await manual.boundingBox())!.height).toBe((await capture.boundingBox())!.height);
  expect((await capture.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
