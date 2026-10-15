import { test, expect, type Page, type Locator } from '@playwright/test';
import { credential, login } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

const dialog = (page: Page) => page.getByRole('alertdialog');
const pending = (page: Page) => page.getByRole('region', { name: 'Pendientes de validación', exact: true });
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
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(pending(page).getByRole('row').filter({ hasText: record.number })).toHaveCount(0);
  await expect(pending(page).getByRole('heading', { name: 'Pendientes de validación' })).toBeFocused();
  await expect(page.getByText('Registro validado', { exact: true })).toBeVisible();
  const detail = (await fixtures(page, 1))[0]!; await page.goto(`/administracion/compras/${detail.id}`);
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.getByText('Validado', { exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: 'Nueva solicitud', exact: true }).click();
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

test('filtros vacíos, repetidos y quitados dan feedback sin consultas ni historial redundantes', async ({ page }) => {
  await login(page, 'administrativo'); await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Sistema de compra', exact: true }).click();
  await expect(pending(page).getByRole('table')).toBeVisible();
  let queries = 0; page.on('request', r => { if (new URL(r.url()).pathname === '/api/v1/purchases') queries++; });
  const apply = page.getByRole('button', { name: 'Aplicar filtros', exact: true });
  const search = page.getByLabel('Buscar solicitudes', { exact: true });
  const status = page.locator('.purchase-filter-feedback');
  const history = await page.evaluate(() => window.history.length);
  await expect(page.getByText('Puedes usar uno o más filtros para acotar la búsqueda')).toBeVisible();
  await search.fill('   '); await apply.focus(); await page.keyboard.press('Enter');
  await expect(status).toHaveText('Ingresa al menos un filtro para acotar la búsqueda'); await expect(apply).toBeFocused();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  expect(queries).toBe(0); expect(await page.evaluate(() => window.history.length)).toBe(history);
  await page.goBack(); await expect(page).toHaveURL(/\/administracion$/); await page.goForward();
  await search.fill('FILTRO-CONTEXTUAL'); await expect(status).toHaveText('Cambios por aplicar');
  await apply.click(); await expect(page).toHaveURL(/q=FILTRO-CONTEXTUAL/);
  await expect(pending(page).getByText('No hay solicitudes que coincidan con los filtros.')).toBeVisible();
  const appliedQueries = queries, appliedHistory = await page.evaluate(() => window.history.length);
  await search.fill(' FILTRO-CONTEXTUAL '); await apply.click();
  await expect(status).toHaveText('Los filtros no han cambiado'); expect(queries).toBe(appliedQueries);
  expect(await page.evaluate(() => window.history.length)).toBe(appliedHistory);
  await search.fill(''); await expect(status).toHaveText('Cambios por aplicar'); await apply.click(); await expect(page).toHaveURL(/\/compras$/);
  await expect(page.locator('.purchase-applied-filters')).toHaveCount(0);
  await page.goBack(); await expect(search).toHaveValue('FILTRO-CONTEXTUAL');
});

test('reaplicar reinicia ambas páginas, limpiar evita duplicados y el no cambio conserva error/reintento', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras?q=CONTEXTUAL-PAGES&pendingPage=2&reviewedPage=2');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page).toHaveURL(/compras\?q=CONTEXTUAL-PAGES$/);
  await expect(page.getByText('Página 1', { exact: true })).toHaveCount(2);
  await page.route('**/api/v1/purchases?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente indisponible', requestId: 'ctx-filters' } }) }));
  await page.goto('/administracion/compras?q=CONTEXTUAL-ERROR');
  await expect(pending(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.locator('.purchase-filter-feedback')).toHaveText('Los filtros no han cambiado');
  await expect(pending(page).getByRole('alert')).toContainText('Servicio temporalmente indisponible');
  await page.unroute('**/api/v1/purchases?**'); await pending(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(pending(page).getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click(); await expect(page).toHaveURL(/\/compras$/);
  const history = await page.evaluate(() => window.history.length);
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click(); expect(await page.evaluate(() => window.history.length)).toBe(history);
});

test('marco y navegación permanecen visibles al desplazar listas/formularios, con fallback móvil y poca altura', async ({ page }) => {
  await login(page, 'administrativo'); await fixtures(page);
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.locator('#admin-content').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await insideViewport(page, toolbar(page));
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
    expect(await page.locator('.admin-shell').evaluate(e => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(height - 15);
    expect(await page.locator('.purchase-table-scroll').first().evaluate(e => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
  }
  await page.getByRole('link', { name: 'Nueva solicitud', exact: true }).click();
  expect(await page.locator('#admin-content').evaluate(e => e.scrollTop)).toBe(0); await expect(page.locator('#admin-content')).toBeFocused();
  for (const [width, height] of [[1280, 720], [390, 844], [640, 450]] as const) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    const field = page.getByLabel(/Proveedor · ítem/).last(); await field.focus(); await field.fill('Foco visible');
    await expect.poll(async () => { const box = await field.boundingBox(); return box!.y > 55 && box!.y + box!.height < height; }, { message: `Campo enfocado visible en ${width}×${height}` }).toBe(true);
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
  await expect(pending(page).getByRole('heading', { name: 'Pendientes de validación' })).toBeFocused();
});
