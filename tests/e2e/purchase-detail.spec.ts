import { test, expect, type Locator, type Page } from '@playwright/test';
import { purchaseFieldLabels } from '../../packages/contracts/src/purchases/labels.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';
import type { CreatePurchase } from '../../packages/contracts/src/purchases/index.js';
import { login } from './support/browser.js';

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
async function expectFields(container: Locator, fields: Record<string, string | null>) {
  for (const [key, value] of Object.entries(fields)) {
    const expected = value === null ? 'Sin dato' : key === 'sentDate' ? value.split('-').reverse().join('/')
      : ['totalAmount', 'taxAmount', 'price', 'amount'].includes(key) ? currency.format(BigInt(value)) : value;
    await expect(container.getByText(purchaseFieldLabels[key]!, { exact: true }).locator('..').locator('dd')).toHaveText(expected);
  }
}

async function createRecord(page: Page, origin?: CreatePurchase['origin']) {
  const input = structuredClone(manualPurchaseExample);
  if (origin) input.origin = origin;
  input.operationId = crypto.randomUUID();
  input.header.requestNumber = `DETAIL-${crypto.randomUUID().slice(0, 8)}`;
  const response = await page.request.post('/api/v1/purchases', { headers: { Origin: new URL(page.url()).origin }, data: input });
  expect(response.status()).toBe(201);
  const record = (await response.json()).data;
  expect(record.header).toEqual(input.header);
  expect(record.lines).toEqual(input.lines);
  expect(record.administrative).toEqual(input.administrative);
  return record;
}

test('detalle coincide con la API, conserva revisión y se recorre con teclado', async ({ page }) => {
  await login(page, 'administrativo');
  const created = await createRecord(page);
  const validation = await page.request.post(`/api/v1/purchases/${created.id}/validation`, {
    headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: created.version },
  });
  expect(validation.status()).toBe(200);
  const response = await page.request.get(`/api/v1/purchases/${created.id}`);
  expect(response.status()).toBe(200);
  const record = (await response.json()).data;
  expect(record.reviewStatus).toBe('reviewed');
  expect(record.administrative).toEqual(created.administrative);
  await page.goto(`/administracion/compras/${record.id}`);
  const check = async () => {
    await expect(page.getByRole('heading', { name: `Solicitud ${record.header.requestNumber}` })).toBeVisible();
    await expect(page.getByText('Revisado en Cenit', { exact: true })).toBeVisible();
    await expect(page.locator('.purchase-detail-heading__amount strong')).toHaveText(currency.format(BigInt(record.header.totalAmount)));
    await expect(page.locator('.purchase-detail-description')).toHaveText(record.header.description);
    await expectFields(page.locator('.purchase-detail-summary'), { requestNumber: record.header.requestNumber, sentDate: record.header.sentDate });
    for (const [index, line] of record.lines.entries()) {
      const item = page.locator('details.purchase-item').filter({ has: page.locator('summary').getByText(`Ítem ${index + 1}`, { exact: true }) });
      await item.locator('summary').focus(); await page.keyboard.press('Enter');
      // La cuenta completa ya incluye los cinco códigos: el detalle no los repite si coinciden.
      const { universityCode, campusCode, unitCode, projectCode, accountingCode, ...shown } = line;
      const parts = line.chargeAccount?.split('.') ?? [];
      const redundant = parts.length === 5 && [universityCode, campusCode, unitCode, projectCode, accountingCode].every((code, i) => code === null || code === parts[i]);
      await expectFields(item, redundant ? shown : line);
      if (redundant) await expect(item.getByText('Código universidad', { exact: true })).toHaveCount(0);
    }
    // Read-only boxes show known values first; empty ones live in a closed «Mostrar … sin dato» disclosure that still holds every field.
    const box = (name: string) => page.locator('.purchase-detail-box').filter({ has: page.getByRole('heading', { name, exact: true }) });
    const { requestNumber: _number, sentDate: _date, description: _description, totalAmount: _total, ...other } = record.header;
    await expectFields(box('Datos de la solicitud'), other);
    const { documentType, ...administrative } = record.administrative;
    await expectFields(box('Seguimiento administrativo'), administrative);
    await expect(page.locator('.purchase-detail-summary')).toContainText(documentType ?? 'Sin dato');
    await expect(page.locator('.purchase-detail-summary')).toContainText('Ingreso manual');
    await expect(box('Registro en Cenit')).toContainText(record.createdBy.name);
    await expect(box('Registro en Cenit')).toContainText(record.reviewedBy.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await check();
  await page.reload();
  await check();
});

test('edición: reemplaza ítems y refresca detalle, listado e Inicio sólo tras confirmar el servidor', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras?q=${record.header.requestNumber}&allYears=1`);
  await page.getByRole('link', { name: `Ver detalles de ${record.header.requestNumber}`, exact: true }).click();
  await page.getByRole('link', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Descripción *', { exact: true }).fill('Descripción corregida desde pantalla');
  await page.getByLabel('Monto total (CLP) *', { exact: true }).fill('9007199254740993');
  for (let remaining = record.lines.length; remaining > 0; remaining--) {
    await page.getByText('Ítem 1', { exact: true }).click();
    await page.getByRole('button', { name: 'Eliminar ítem 1', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Descripción · ítem 1', { exact: true }).fill('Único ítem corregido');
  await page.getByLabel('Proveedor · ítem 1', { exact: true }).fill('Proveedor de revisión');
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
    expect((await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data).toEqual(record);
  } finally { release?.(); }
  await expect(page).toHaveURL(new RegExp(`/compras/${record.id}$`));
  const corrected = (await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data;
  expect(corrected.version).toBe(record.version + 1);
  expect(corrected.source).toBe('manual'); expect(corrected.lines).toHaveLength(1);
  expect(corrected.lines[0].provider).toBe('Proveedor de revisión');
  await expect(page.getByText('Descripción corregida desde pantalla', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: record.header.requestNumber });
  await expect(row).toContainText('Descripción corregida desde pantalla');
  await expect(row).toContainText(currency.format(9007199254740993n));
  await page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page.locator('.dashboard-recent')).toContainText('Descripción corregida desde pantalla');
  await page.reload();
  const persisted = (await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data;
  expect(persisted).toEqual(corrected);
});

test('edición: conserva borrador ante 503 y reintenta una respuesta perdida sin duplicar', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${record.id}/editar`);
  const description = page.getByLabel('Descripción *', { exact: true });
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
  expect((await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data).toEqual(record);
  await save.click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  await expect(description).toHaveValue('Corrección conservada tras fallo');
  await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
  const accepted = (await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data;
  expect(accepted.version).toBe(record.version + 1);
  await save.click();
  await expect(page).toHaveURL(new RegExp(`/compras/${record.id}$`));
  expect(versions).toEqual([record.version, record.version, record.version]);
  expect((await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data).toEqual(accepted);
});

test('edición: conflicto real conserva el borrador y la versión del otro administrativo', async ({ page }) => {
  await login(page, 'administrativo');
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${record.id}/editar`);
  await page.getByLabel('Descripción *', { exact: true }).fill('Mi corrección pendiente');
  const other = await page.request.put(`/api/v1/purchases/${record.id}`, { headers: { Origin: new URL(page.url()).origin }, data: { header: { ...record.header, description: 'Corrección concurrente ya guardada' }, administrative: record.administrative, lines: [], expectedVersion: record.version } });
  expect(other.status()).toBe(200);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El registro cambió');
  await expect(page.getByLabel('Descripción *', { exact: true })).toHaveValue('Mi corrección pendiente');
  await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
  expect((await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data).toEqual((await other.json()).data);
});

test('edición: ejemplos de sólo lectura y sesión inválida descarta el borrador al volver', async ({ page, context }) => {
  await login(page, 'administrativo');
  const example = await createRecord(page, { type: 'contract_example', exampleId: 'recovered' });
  await page.goto(`/administracion/compras/${example.id}`);
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
  await page.goto(`/administracion/compras/${example.id}/editar`);
  await expect(page.getByText('Los ejemplos de demostración no se pueden editar.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0);
  const record = await createRecord(page);
  await page.goto(`/administracion/compras/${record.id}/editar`);
  await page.getByLabel('Descripción *', { exact: true }).fill('Borrador que debe descartarse');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Cambios guardados', { exact: true })).toHaveCount(0);
  await login(page, 'administrativo');
  await page.goto(`/administracion/compras/${record.id}/editar`);
  await expect(page.getByLabel('Descripción *', { exact: true })).toHaveValue(record.header.description);
  expect((await (await page.request.get(`/api/v1/purchases/${record.id}`)).json()).data).toEqual(record);
});

for (const editing of [false, true]) {
  const screen = editing ? 'edición' : 'detalle', suffix = editing ? '/editar' : '';
  test(`${screen}: enlace inválido e inexistente vuelven al registro con teclado y filtros`, async ({ page }) => {
    await login(page, 'administrativo');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/administracion/compras/enlace-invalido${suffix}`);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('El enlace de esta compra no es válido.');
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
    const back = alert.getByRole('link', { name: 'Volver al registro', exact: true });
    await expect(back).toHaveAttribute('href', '/administracion/compras');
    await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `tmp/scrum-106/${editing ? 'edicion' : 'detalle'}-400-1440.png`, animations: 'disabled' });
    await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/administracion\/compras$/);

    const record = await createRecord(page);
    const returnTo = `/administracion/compras?q=${record.header.requestNumber}&allYears=1&sort=sentDateAsc&pageSize=50`;
    await page.goto(returnTo);
    const detail = page.getByRole('link', { name: `Ver detalles de ${record.header.requestNumber}`, exact: true });
    await expect(detail).toHaveAttribute('aria-disabled', 'false');
    if (editing) {
      await detail.click();
      await expect(page.getByRole('link', { name: 'Editar', exact: true })).toBeVisible();
    }
    const deleted = await page.request.delete(`/api/v1/purchases/${record.id}`, {
      headers: { Origin: new URL(page.url()).origin }, data: { expectedVersion: record.version },
    });
    expect(deleted.status()).toBe(200);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await (editing ? page.getByRole('link', { name: 'Editar', exact: true }) : detail).click();
    await expect(alert).toContainText('No encontramos esta compra.');
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Datos principales' })).toHaveCount(0);
    await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(back).toHaveAttribute('href', returnTo);
    await expect(page.locator('.cenit-page-enter')).toHaveCSS('opacity', '1');
    await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new URL(returnTo, page.url()).href);
    await expect(page.getByLabel('Buscar solicitudes', { exact: true })).toHaveValue(record.header.requestNumber);
  });

  test(`${screen}: error temporal y fallo de red conservan el reintento sin mostrar datos`, async ({ page }) => {
    await login(page, 'administrativo');
    const record = await createRecord(page);
    const endpoint = `**/api/v1/purchases/${record.id}`;
    for (const network of [false, true]) {
      await page.route(endpoint, route => network ? route.abort('failed') : route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Detalle temporalmente indisponible', requestId: 'test' } } }));
      await page.goto(`/administracion/compras/${record.id}${suffix}`);
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(network ? 'No se pudo conectar con el servidor.' : 'Detalle temporalmente indisponible');
      await expect(page.getByRole('heading', { name: 'Datos principales' })).toHaveCount(0);
      await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveCount(0);
      const retry = alert.getByRole('button', { name: 'Reintentar', exact: true });
      await retry.focus(); await expect(retry).toBeFocused();
      await page.unroute(endpoint);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: editing ? 'Editar compra' : `Solicitud ${record.header.requestNumber}`, exact: true })).toBeVisible();
      if (editing) await expect(page.getByLabel('Nº Documento / solicitud *', { exact: true })).toHaveValue(record.header.requestNumber);
    }
  });
}
