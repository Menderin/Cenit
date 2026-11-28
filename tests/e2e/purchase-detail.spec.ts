import { test, expect, type Page } from '@playwright/test';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import type { CreatePurchase, PurchaseRecord } from '../../packages/contracts/src/purchases/index.js';
import { inspectSlowPanel, login } from './support/browser.js';

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
// Se usan los mismos campos al registrar y corregir.
const field = (page: Page, key: string) => page.locator(`#purchase-record-${key}`);
const current = async (page: Page, id: string): Promise<PurchaseRecord> => (await (await page.request.get(`/api/v1/purchases/${id}`)).json()).data;

async function createRecord(page: Page, change: (input: CreatePurchase) => void = () => undefined): Promise<PurchaseRecord> {
  const input = structuredClone(manualPurchaseExample);
  input.operationId = crypto.randomUUID();
  input.record.requestNumber = `DETAIL-${crypto.randomUUID().slice(0, 8)}`;
  change(input);
  const response = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: input });
  expect(response.status()).toBe(201);
  const record = (await response.json()).data;
  expect(record.record).toEqual(input.record);
  expect(record.oracle).toEqual(input.oracle);
  expect(record.lines).toEqual(input.lines);
  return record;
}

test('ficha: coincide con la API, marca el pago y recorre la página sin perder el listado', async ({ page }) => {
  await login(page, 'administrativo');
  const prefix = `FICHA-${crypto.randomUUID().slice(0, 8)}`;
  const first = await createRecord(page, input => { input.record.requestNumber = `${prefix}-1`; input.record.recordDate = '2026-10-13'; });
  const second = await createRecord(page, input => {
    input.record.requestNumber = `${prefix}-2`;
    input.record.recordDate = '2001-01-01';
    input.record.provider = 'Proveedor Ficticio B';
    input.record.totalAmount = '9'.repeat(255);
  });
  await page.goto(`/administracion/compras?q=${prefix}&allYears=1`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('link', { name: `Abrir la ficha de la compra ${first.record.requestNumber}`, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await inspectSlowPanel(sheet, 'tmp/purchase-sheet-slow.png');
  const check = async (record: PurchaseRecord) => {
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(record.record.provider!);
    await expect(sheet).toContainText(`Solicitud ${record.record.requestNumber}`);
    await expect(sheet).toContainText(currency.format(BigInt(record.record.totalAmount)));
    await expect(sheet).toContainText(record.record.description);
    await expect(sheet).toContainText('RUT 76.918.240-3');
    for (const code of [record.record.unitCode!, record.record.projectCode!, record.record.accountingCode!]) await expect(sheet).toContainText(code);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await check(first);
  const changingContent = sheet.locator('.purchase-sheet__body.purchase-sheet__change');
  await expect(changingContent).toHaveCount(0);
  const initialDialog = (await sheet.elementHandle())!;
  // Lo de Oracle queda plegado al final y se abre a pedido.
  const oracle = sheet.locator('summary', { hasText: 'Datos de Oracle' });
  await expect(sheet.getByText(first.oracle.oracleId!, { exact: true })).toBeHidden();
  await oracle.click();
  await expect(sheet.getByText(first.oracle.oracleId!, { exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Marcar como pagado', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Volver a pendiente', exact: true })).toBeVisible();
  const paid = await current(page, first.id);
  expect(paid.record.paymentSituation).toBe('PAGADO');
  expect(paid.version).toBe(first.version + 1);

  await expect(sheet.getByRole('button', { name: 'Compra anterior', exact: true })).toBeDisabled();
  const next = sheet.getByRole('button', { name: 'Compra siguiente', exact: true });
  await next.press('Enter');
  await inspectSlowPanel(changingContent, 'tmp/purchase-sheet-change-slow.png');
  await expect(page).toHaveURL(new RegExp(`/compras/${second.id}\\?`));
  await check(second);
  expect(await sheet.evaluate((element, initial) => element.isSameNode(initial), initialDialog)).toBe(true);
  await expect(next).toBeFocused();
  expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const previous = sheet.getByRole('button', { name: 'Compra anterior', exact: true });
  await previous.press('Enter');
  await check(first);
  await expect(previous).toBeFocused();
  await expect(changingContent).toHaveCSS('transition-property', 'opacity');
  await expect(changingContent).toHaveCSS('transition-duration', '0.09s');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/administracion/compras\\?q=${prefix}`));
  await expect(page.getByRole('link', { name: `Abrir la ficha de la compra ${first.record.requestNumber}`, exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: `Situación de pago de ${first.record.requestNumber}: pagado. Volver a pendiente`, exact: true })).toBeVisible();

  // Un enlace directo abre la misma ficha sobre el listado.
  await page.goto(`/administracion/compras/${first.id}`);
  await check(first);
  await page.reload();
  await check(first);
});

test('ficha: carga con nombre accesible y conserva la salida con movimiento reducido', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/purchases/${record.id}`, async route => { await pending; await route.continue(); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/administracion/compras/${record.id}`);
  const sheet = page.getByRole('dialog', { name: 'Ficha de compra', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Cerrar ficha', exact: true })).toBeFocused();
  await expect(sheet).toHaveCSS('transition-property', 'opacity');
  await expect(sheet).toHaveCSS('translate', 'none');
  release();
  const settled = page.getByRole('dialog', { name: record.record.provider!, exact: true });
  await expect(settled).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settled).toHaveCount(0);
});

test('ficha: una compra lenta reserva el espacio del contenido y de las acciones', async ({ page }) => {
  await login(page, 'administrativo');
  const prefix = `FICHA-LENTA-${crypto.randomUUID().slice(0, 8)}`;
  const first = await createRecord(page, input => {
    Object.assign(input.record, { requestNumber: `${prefix}-1`, recordDate: '2026-10-13', provider: 'Proveedor de prueba A' });
  });
  const second = await createRecord(page, input => {
    Object.assign(input.record, { requestNumber: `${prefix}-2`, recordDate: '2026-10-12', provider: 'Proveedor de prueba B' });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/administracion/compras?q=${prefix}&allYears=1`);
  await page.getByRole('link', { name: `Abrir la ficha de la compra ${first.record.requestNumber}`, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Proveedor de prueba A');
  await expect(sheet).toHaveCSS('opacity', '1');
  const positions = () => sheet.evaluate(element => ['.purchase-sheet__bar', '.purchase-sheet__body', '.purchase-sheet__footer'].map(selector => {
    const bounds = element.querySelector(selector)?.getBoundingClientRect();
    return bounds ? [Math.round(bounds.top), Math.round(bounds.height)] : null;
  }));
  const loadedPositions = await positions();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/purchases/${second.id}`, async route => { await pending; await route.continue(); });
  const next = sheet.getByRole('button', { name: 'Compra siguiente', exact: true });
  try {
    await next.press('Enter');
    await expect(sheet.getByRole('status').first()).toHaveText('Cargando la compra…');
    expect(await positions()).toEqual(loadedPositions);
    await expect(sheet.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Marcar como pagado', exact: true })).toHaveCount(0);
    await expect(sheet.locator('.purchase-sheet__loading')).toHaveCSS('transition-delay', '0.12s');
    await expect(sheet.locator('.purchase-sheet__loading')).toHaveCSS('opacity', '1');
    await expect(next).toBeFocused();
    await page.screenshot({ path: 'tmp/purchase-sheet-loading.png' });
  } finally {
    release();
  }
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Proveedor de prueba B');
  expect(await positions()).toEqual(loadedPositions);
  await expect(next).toBeFocused();
});

test('edición: corrige la fila y refresca ficha, listado e Inicio sólo tras confirmar el servidor', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras?q=${record.record.requestNumber}&allYears=1`);
  await page.getByRole('link', { name: `Abrir la ficha de la compra ${record.record.requestNumber}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Editar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editar compra', exact: true })).toBeVisible();
  await field(page, 'description').fill('Descripción corregida desde pantalla');
  await field(page, 'totalAmount').fill('9007199254740993');
  let release: (() => void) | undefined;
  await page.route(`**/api/v1/purchases/${record.id}`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    await new Promise<void>(resolve => { release = resolve; });
    await route.continue();
  });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(page.getByRole('button', { name: 'Guardando cambios…', exact: true })).toBeDisabled();
    await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
    expect(await current(page, record.id)).toEqual(record);
  } finally { release?.(); }
  await expect(page).toHaveURL(new RegExp(`/compras/${record.id}(\\?|$)`));
  const corrected = await current(page, record.id);
  expect(corrected.version).toBe(record.version + 1);
  expect(corrected.source).toBe('manual');
  expect(corrected.record).toEqual({ ...record.record, description: 'Descripción corregida desde pantalla', totalAmount: '9007199254740993' });
  expect(corrected.lines).toEqual(record.lines);
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Descripción corregida desde pantalla');
  await sheet.getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: record.record.requestNumber });
  await expect(row).toContainText('Descripción corregida desde pantalla');
  await expect(row).toContainText(currency.format(9007199254740993n));
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  const refreshed = (await (await page.request.get('/api/v1/purchases/summary')).json()).data;
  await expect(page.locator('.home-figure--main .home-figure__value')).toHaveText(currency.format(BigInt(refreshed.overview.documentTotalThisYear)));
  await page.reload();
  expect(await current(page, record.id)).toEqual(corrected);
});

test('edición: conserva el borrador ante 503 y reintenta una respuesta perdida sin duplicar', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${record.id}/editar`);
  const description = field(page, 'description');
  await description.fill('Corrección conservada tras fallo');
  const versions: number[] = [];
  let attempt = 0;
  await page.route(`**/api/v1/purchases/${record.id}`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    versions.push(route.request().postDataJSON().expectedVersion);
    attempt++;
    if (attempt === 1) return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Fallo temporal ficticio', requestId: 'scrum121' } } });
    if (attempt === 2) { const response = await route.fetch(); expect(response.status()).toBe(200); return route.abort('failed'); }
    await route.continue();
  });
  const save = page.getByRole('button', { name: 'Guardar cambios', exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Fallo temporal ficticio');
  await expect(description).toHaveValue('Corrección conservada tras fallo');
  expect(await current(page, record.id)).toEqual(record);
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Tus cambios siguen aquí');
  await expect(description).toHaveValue('Corrección conservada tras fallo');
  await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
  const accepted = await current(page, record.id);
  expect(accepted.version).toBe(record.version + 1);
  await save.click();
  await expect(page).toHaveURL(new RegExp(`/compras/${record.id}(\\?|$)`));
  expect(versions).toEqual([record.version, record.version, record.version]);
  expect(await current(page, record.id)).toEqual(accepted);
});

test('edición: un conflicto real conserva el borrador y la versión del otro administrativo', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${record.id}/editar`);
  await field(page, 'description').fill('Mi corrección pendiente');
  const other = await page.request.put(`/api/v1/purchases/${record.id}`, { headers: { Origin: new URL(page.url()).origin },
    data: { record: { ...record.record, description: 'Corrección concurrente ya guardada' }, oracle: record.oracle, lines: [], expectedVersion: record.version } });
  expect(other.status()).toBe(200);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El registro cambió');
  await expect(field(page, 'description')).toHaveValue('Mi corrección pendiente');
  await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
  expect(await current(page, record.id)).toEqual((await other.json()).data);
});

test('edición: ejemplos de sólo lectura y sesión inválida descarta el borrador al volver', async ({ page, context }) => {
  await login(page, 'administrativo');
  const example = await createRecord(page, input => { input.origin = { type: 'contract_example', exampleId: 'recovered' }; });
  await page.goto(`/administracion/compras/${example.id}`);
  await expect(page.getByRole('dialog')).toContainText(`Solicitud ${example.record.requestNumber}`);
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
  await page.goto(`/administracion/compras/${example.id}/editar`);
  await expect(page.getByText('Los ejemplos de demostración no se pueden editar.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0);
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${record.id}/editar`);
  await field(page, 'description').fill('Borrador que debe descartarse');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
  await login(page, 'administrativo');
  await page.goto(`/administracion/compras/${record.id}/editar`);
  await expect(field(page, 'description')).toHaveValue(record.record.description);
  expect(await current(page, record.id)).toEqual(record);
});

test('ficha: enlace inválido e inexistente vuelven al registro con teclado y filtros', async ({ page }) => {
  await login(page, 'administrativo');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/administracion/compras/enlace-invalido');
  const alert = page.getByRole('dialog').getByRole('alert');
  await expect(alert).toContainText('El enlace de esta compra no es válido.');
  await expect(alert.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
  const back = alert.getByRole('link', { name: 'Volver al registro', exact: true });
  await expect(back).toHaveAttribute('href', '/administracion/compras');
  await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/administracion\/compras$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const record = await createRecord(page);
  const returnTo = `/administracion/compras?q=${record.record.requestNumber}&allYears=1&sort=dateAsc&pageSize=50`;
  await page.goto(returnTo);
  const detail = page.getByRole('link', { name: `Abrir la ficha de la compra ${record.record.requestNumber}`, exact: true });
  await expect(detail).toHaveAttribute('aria-disabled', 'false');
  const deleted = await page.request.delete(`/api/v1/purchases/${record.id}`, { headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: record.version } });
  expect(deleted.status()).toBe(200);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await detail.click();
  await expect(alert).toContainText('No encontramos esta compra.');
  await expect(alert.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(back).toHaveAttribute('href', returnTo);
  await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new URL(returnTo, page.url()).href);
  await expect(page.getByLabel('Buscar compras', { exact: true })).toHaveValue(record.record.requestNumber);
});

for (const editing of [false, true]) {
  test(`${editing ? 'edición' : 'ficha'}: error temporal y fallo de red conservan el reintento sin mostrar datos`, async ({ page }) => {
    await login(page, 'administrativo');
    const record = await createRecord(page);
    const endpoint = `**/api/v1/purchases/${record.id}`;
    for (const network of [false, true]) {
      await page.route(endpoint, route => network ? route.abort('failed') : route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Detalle temporalmente indisponible', requestId: 'test' } } }));
      await page.goto(`/administracion/compras/${record.id}${editing ? '/editar' : ''}`);
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(network ? 'No se pudo conectar con el servidor.' : 'Detalle temporalmente indisponible');
      // La lista de fondo puede mostrar otras compras con el mismo DETALLE; lo que no debe aparecer es la ficha ni el formulario.
      if (!editing) await expect(page.getByRole('dialog').getByText(record.record.description, { exact: true })).toHaveCount(0);
      await expect(field(page, 'requestNumber')).toHaveCount(0);
      const retry = alert.getByRole('button', { name: 'Reintentar', exact: true });
      await retry.focus(); await expect(retry).toBeFocused();
      await page.unroute(endpoint);
      await page.keyboard.press('Enter');
      if (editing) await expect(field(page, 'requestNumber')).toHaveValue(record.record.requestNumber);
      else await expect(page.getByRole('dialog')).toContainText(`Solicitud ${record.record.requestNumber}`);
    }
  });
}
