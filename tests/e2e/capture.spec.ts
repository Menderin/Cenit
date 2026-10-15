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
  return response;
}
async function open(page: Page) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Subir captura', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisar captura', exact: true })).toBeVisible();
}
async function choose(page: Page) {
  await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('button', { name: 'Extraer datos', exact: true })).toBeEnabled();
}

test('captura: selección local, límites y vista previa sin enviar automáticamente', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Seleccionar imagen', exact: true }).focus();
  await page.getByRole('button', { name: 'Seleccionar imagen', exact: true }).press('Enter');
  await (await chooser).setFiles(file);
  await expect(page.getByRole('button', { name: 'Extraer datos', exact: true })).toBeEnabled();
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toBeVisible();
  expect(calls).toBe(0);
});

test('captura: revisión compartida, transferencia y guardado sólo al confirmar', async ({ page }) => {
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
  await choose(page); await page.getByRole('button', { name: 'Extraer datos', exact: true }).click();
  await expect(page.getByText('Formato compatible', { exact: false }).first()).toBeVisible();
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción', { exact: true }).fill('Corrección humana de prueba');
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/capture-review-${width}.png`, fullPage: true });
  }
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Continuar al formulario', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/nueva$/);
  expect(saves).toBe(0);
  await expect(page.getByText('Captura procesada y revisada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar solicitud', exact: true }).click();
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
  await choose(page); await page.getByRole('button', { name: 'Extraer datos', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El procesador no está disponible');
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('Captura parcial: revisa los datos recuperados', { exact: false }).first()).toBeVisible();
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
  await choose(page); await page.getByRole('button', { name: 'Extraer datos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analizando captura…', exact: true })).toBeDisabled();
  await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles({ ...file, name: 'otra.png' });
  await expect(page.getByRole('button', { name: 'Extraer datos', exact: true })).toBeEnabled();
  release();
  await expect(page.getByRole('button', { name: 'Continuar al formulario', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Extraer datos', exact: true }).click();
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción', { exact: true }).fill('Borrador privado');
  await page.getByRole('link', { name: 'Volver a solicitudes', exact: true }).click();
  const discardPrompt = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await discardPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/captura$/);
  await page.getByRole('link', { name: 'Volver a solicitudes', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Descartar cambios' }).getByRole('button', { name: 'Descartar y salir', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/);
});

test('captura: sesión vencida y cambio de cuenta no restauran archivo ni revisión', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result() }));
  await choose(page); await page.getByRole('button', { name: 'Extraer datos', exact: true }).click();
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción', { exact: true }).fill('No restaurar');
  await page.evaluate(() => window.dispatchEvent(new Event('cenit:unauthenticated')));
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toHaveCount(0);
  // The server cookie is still valid in this simulated client-expiry case; close it explicitly.
  expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} })).status()).toBe(204);
  await login(page, 'docente'); await page.goto('/administracion/compras/captura');
  await expect(page).toHaveURL(/\/academico$/);
  expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} })).status()).toBe(204);
  await page.goto('/login'); await login(page, 'administrativo'); await page.goto('/administracion/compras/captura');
  await expect(page.getByRole('button', { name: 'Extraer datos', exact: true })).toBeDisabled();
  await expect(page.getByAltText('Vista previa de la captura seleccionada')).toHaveCount(0);
});

test('captura real: subir, revisar, guardar y recargar mediante OCR del notebook', async ({ page }) => {
  test.skip(process.env.CENIT_E2E_REAL_OCR !== '1', 'Ensayo explícito separado; requiere OCR real y captura ficticia.');
  test.setTimeout(90000);
  await open(page);
  await page.getByLabel('Captura de la solicitud de compra', { exact: true }).setInputFiles({ name: 'captura-real-ficticia.png', mimeType: 'image/png', buffer: readFileSync('tmp/ocr-layout-v2/full.png') });
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/purchases/extractions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Extraer datos', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText('Formato compatible', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: 'tmp/capture-real-desktop.png', fullPage: true });
  await page.getByRole('group', { name: 'Datos principales', exact: true }).getByLabel('Descripción', { exact: true }).fill('Captura ficticia revisada desde el navegador');
  await page.getByRole('button', { name: 'Continuar al formulario', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar solicitud', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.locator('.purchase-detail-meta')).toContainText('Captura procesada y revisada');
  await expect(page.getByText('Captura ficticia revisada desde el navegador', { exact: true }).first()).toBeVisible();
});
