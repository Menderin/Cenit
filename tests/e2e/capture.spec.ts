import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { recoveredExample } from '../../packages/contracts/src/purchases/examples.js';
import type { ExtractionResponse, CreatePurchase } from '../../packages/contracts/src/purchases/index.js';
import { login } from './support/browser.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGP8//8/AwwwwVl4OQCWbgMF7ZjH1AAAAABJRU5ErkJggg==', 'base64');
const file = { name: 'captura-ficticia.png', mimeType: 'image/png', buffer: png };
function result(partial = false): ExtractionResponse {
  const response = structuredClone(recoveredExample);
  response.data.captureLayout = partial ? { status: 'partial', signals: ['request_title', 'header_fields'] } : { status: 'compatible', signals: ['request_title', 'header_fields', 'line_section', 'eight_column_table'] };
  response.data.origin = { type: 'image_capture', extractionId: response.data.extractionId, processorVersion: 'ppocr5-latin-grid8-layout-v2', processedAt: new Date().toISOString(), receipt: 'A'.repeat(43) };
  response.data.regions = [{ path: '/header/description', x: .1, y: .2, width: .7, height: .15 }];
  return response;
}
async function open(page: Page) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Subir captura', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registrar desde una captura', exact: true })).toBeVisible();
}
async function choose(page: Page) {
  await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles(file);
}

test('captura: selección local, límites y vista previa análisis automático después de validar el archivo', async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route('**/api/v1/purchases/extractions', route => { calls++; return route.fulfill({ json: result() }); });
  const input = page.getByLabel('Captura de la solicitud de compra', { exact: true });
  await input.setInputFiles({ name: 'archivo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake') });
  await expect(page.getByRole('alert')).toContainText('PNG o JPEG');
  await input.setInputFiles({ ...file, buffer: Buffer.alloc(5*1024*1024+1) });
  await expect(page.getByRole('alert')).toContainText('5 MiB');
  await input.setInputFiles({ ...file, buffer: Buffer.from('not a png') });
  await expect(page.getByRole('alert')).toContainText('No se pudo abrir');
  const huge = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 5001; canvas.height = 4000;
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await input.setInputFiles({ ...file, buffer: Buffer.from(huge, 'base64') });
  await expect(page.getByRole('alert')).toContainText('20 megapíxeles');
  const chooser = page.waitForEvent('filechooser');
  const drop = page.getByRole('button', { name: /Arrastra la imagen aquí/ });
  await drop.focus(); await drop.press('Enter');
  await (await chooser).setFiles(file);
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toBeVisible();
  await expect.poll(() => calls).toBe(1);
});

test('captura: imagen y formulario compartido, guardado sólo al confirmar', async ({ page }) => {
  await open(page);
  const response = result(); let saves = 0;
  await page.route('**/api/v1/purchases/extractions', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
    expect(route.request().postDataBuffer()!.toString()).toContain('name="file"');
    await route.fulfill({ json: response });
  });
  const id = randomUUID(); let saved: Record<string, unknown>;
  await page.route(/\/api\/v1\/purchases$/, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saves++;
    const body = route.request().postDataJSON() as CreatePurchase;
    expect(body.origin).toEqual(response.data.origin);
    expect(body.header.description).toBe('Corrección humana de prueba');
    saved = { header: body.header, lines: body.lines, administrative: body.administrative, id, source: 'image_capture', exampleId: null,
      capture: { type: 'image_capture', extractionId: response.data.extractionId, processorVersion: response.data.origin!.processorVersion, processedAt: response.data.origin!.processedAt },
      reviewStatus: 'pending', version: 1, createdAt: new Date().toISOString(), createdBy: { id: randomUUID(), name: 'Administrativo de prueba' }, reviewedAt: null, reviewedBy: null };
    await route.fulfill({ status: 201, json: { data: saved } });
  });
  await page.route(new RegExp(`/api/v1/purchases/${id}$`), route => route.fulfill({ json: { data: saved } }));
  await choose(page);
  await expect(page.getByText('Formato compatible', { exact: false }).first()).toBeVisible();
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción *', { exact: true }).fill('Corrección humana de prueba');
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/capture-review-${width}.png`, fullPage: true });
  }
  expect(saves).toBe(0);
  await expect(page).toHaveURL(/\/compras\/captura$/);
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/compras/${id}$`));
  expect(saves).toBe(1);
  await expect(page.getByText('Corrección humana de prueba', { exact: true }).first()).toBeVisible();
});

test('captura: parcial, fallo comprensible y reintento conserva la imagen', async ({ page }) => {
  await open(page); let calls = 0;
  await page.route('**/api/v1/purchases/extractions', route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, json: { error: { code: 'EXTRACTION_UNAVAILABLE', message: 'El procesador no está disponible.', requestId: 'capture-test' } } }) : route.fulfill({ json: result(true) });
  });
  await choose(page);
  await expect(page.getByRole('alert')).toContainText('El procesador no está disponible');
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toBeVisible();
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const message = await page.getByRole('alert').boundingBox();
    for (const name of ['Cambiar captura', 'Reintentar extracción']) {
      const button = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(message && button && (button.y >= message.y + message.height || button.x >= message.x + message.width)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Reintentar extracción', exact: true }).click();
  await expect(page.getByText('Captura parcial', { exact: false }).first()).toBeVisible();
});

test('captura: cambio de archivo cancela y descarta respuestas tardías; corrige con confirmación', async ({ page }) => {
  await open(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/api/v1/purchases/extractions', async route => {
    calls++;
    if (calls === 1) await gate;
    await route.fulfill({ json: result() }).catch(() => {});
  });
  await choose(page);
  await expect(page.getByRole('button', { name: 'Analizando…', exact: true })).toBeDisabled();
  await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles({ ...file, name: 'otra.png' });
  release();
  await expect(page.getByRole('button', { name: 'Continuar al formulario', exact: true })).toHaveCount(0);
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción *', { exact: true }).fill('Borrador privado');
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  const discardPrompt = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await discardPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/captura$/);
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Descartar cambios' }).getByRole('button', { name: 'Descartar y salir', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/);
});

test('captura: sesión vencida y cambio de cuenta no restauran archivo ni revisión', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result() }));
  await choose(page);
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción *', { exact: true }).fill('No restaurar');
  await page.evaluate(() => window.dispatchEvent(new Event('cenit:unauthenticated')));
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toHaveCount(0);
  // The server cookie is still valid in this simulated client-expiry case; close it explicitly.
  expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} })).status()).toBe(204);
  await login(page, 'docente'); await page.goto('/administracion/compras/captura');
  await expect(page).toHaveURL(/\/academico$/);
  expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} })).status()).toBe(204);
  await page.goto('/login'); await login(page, 'administrativo'); await page.goto('/administracion/compras/captura');
  await expect(page.getByRole('button', { name: /Arrastra la imagen aquí/ })).toBeVisible();
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toHaveCount(0);
});

test('captura real: subir, revisar, guardar y recargar mediante OCR del notebook', async ({ page }) => {
  test.skip(process.env.CENIT_E2E_REAL_OCR !== '1', 'Ensayo explícito separado; requiere OCR real y captura ficticia.');
  test.setTimeout(90000);
  await open(page);
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/purchases/extractions') && r.request().method() === 'POST');
  await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles({ name: 'captura-real-ficticia.png', mimeType: 'image/png', buffer: readFileSync('tmp/ocr-layout-v2/full.png') });
  const extraction = await response;
  expect(extraction.status()).toBe(200);
  const data = (await extraction.json()).data as ExtractionResponse['data'];
  expect(data.regions!.length).toBeGreaterThan(0);
  expect(data.regions!.some(region => region.path === '/header/description')).toBe(true);
  await expect(page.getByText('Formato compatible', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: 'tmp/capture-real-desktop.png', fullPage: true });
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción *', { exact: true }).fill('Captura ficticia revisada desde el navegador');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.locator('.purchase-detail-summary')).toContainText('Captura procesada y revisada');
  await expect(page.getByText('Captura ficticia revisada desde el navegador', { exact: true }).first()).toBeVisible();
});

test('captura: fallo temporal recupera archivo, originales, correcciones y operación en la misma cuenta', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result() }));
  await choose(page);
  const description = page.getByLabel('Descripción *', { exact: true });
  await description.fill('Corrección conservada tras fallo temporal');
  const attempts: CreatePurchase[] = [];
  await page.route(/\/api\/v1\/purchases$/, route => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'capture-retry' } } });
  });
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  await page.route('**/api/v1/auth/session', route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toHaveText('No se pudo comprobar la sesión. Intenta nuevamente.');
  await expect(description).toHaveCount(0);
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toHaveCount(0);
  await page.unroute('**/api/v1/auth/session'); await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(description).toHaveValue('Corrección conservada tras fallo temporal');
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toBeVisible();
  await expect(page.locator('.capture-preview figcaption')).toContainText(file.name);
  await expect(page.getByText('Corregido', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test('captura: regiones y campos se vinculan, el zoom se ajusta y los recuadros se pueden ocultar', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result() }));
  await choose(page);
  const field = page.getByLabel('Descripción *', { exact: true });
  const region = page.getByRole('button', { name: 'Ver campo: Descripción', exact: true });
  await region.click(); await expect(field).toBeFocused(); await expect(region).toHaveAttribute('data-active', 'true');
  await page.getByLabel('Nº Documento / solicitud *', { exact: true }).focus();
  await expect(region).toHaveAttribute('data-active', 'false');
  await field.focus(); await expect(region).toHaveAttribute('data-active', 'true');
  await page.getByRole('button', { name: 'Acercar imagen', exact: true }).click();
  await expect(page.locator('.capture-preview__image')).toHaveAttribute('data-zoom', '1.5');
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await expect(page.locator('.capture-preview__image')).toHaveAttribute('data-zoom', '1');
  await page.getByRole('button', { name: 'Ocultar recuadros', exact: true }).click(); await expect(region).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar recuadros', exact: true }).click(); await expect(region).toBeVisible();
  await page.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
  await page.getByLabel('Descripción · ítem 3', { exact: true }).focus();
  await expect(region).toHaveAttribute('data-active', 'false');
  await page.locator('.purchase-review__field').filter({ has: page.getByLabel('Nº Documento / solicitud *', { exact: true }) }).getByText('Ver original', { exact: false }).click();
  await expect(page.getByText('Sin ubicación disponible', { exact: true }).first()).toBeVisible();
});

test('captura: paneles completos, imagen ajustada y fija al recorrer el formulario', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result() }));
  for (const [width, height] of [[1200, 1800], [1800, 700]]) {
    const buffer = await page.evaluate(([width, height]) => {
      const canvas = document.createElement('canvas'); canvas.width = width!; canvas.height = height!;
      return canvas.toDataURL().split(',')[1]!;
    }, [width!, height!]);
    await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles({ ...file, buffer: Buffer.from(buffer, 'base64') });
    const confirmation = page.getByRole('alertdialog', { name: 'Cambiar captura' });
    if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: 'Descartar y cambiar', exact: true }).click();
    await expect(page.getByText('Formato compatible', { exact: false }).first()).toBeVisible();
    const preview = page.locator('.capture-preview'), review = page.locator('.capture-review');
    const before = (await preview.boundingBox())!, form = (await review.boundingBox())!;
    expect(Math.abs(before.y - form.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(before.height - form.height)).toBeLessThanOrEqual(1);
    const bottom = await page.locator('.admin-content').evaluate(el => el.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).paddingBottom));
    expect(Math.abs(before.y + before.height - bottom)).toBeLessThanOrEqual(1);
    const viewport = (await page.getByRole('region', { name: 'Imagen y datos extraídos' }).boundingBox())!;
    const image = (await page.getByAltText('Vista previa de la captura seleccionada').boundingBox())!;
    expect(image.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(image.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(Math.max(image.width / viewport.width, image.height / viewport.height)).toBeGreaterThan(.98);
    await review.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await review.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await page.getByLabel('Descripción *', { exact: true }).focus();
    await page.getByRole('button', { name: 'Acercar imagen', exact: true }).click();
    await page.getByLabel('Descripción *', { exact: true }).focus();
    await expect.poll(async () => (await preview.boundingBox())!.y).toBe(before.y);
    expect((await preview.boundingBox())!.height).toBe(before.height);
    expect(await page.locator('.admin-content').evaluate(el => el.scrollTop)).toBe(0);
  }
});
