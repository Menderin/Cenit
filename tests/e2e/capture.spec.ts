import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { recoveredExample } from '../../packages/contracts/src/purchases/examples.js';
import type { ExtractionResponse, CreatePurchase } from '../../packages/contracts/src/purchases/index.js';
import { inspectSlowPanel, login } from './support/browser.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGP8//8/AwwwwVl4OQCWbgMF7ZjH1AAAAABJRU5ErkJggg==', 'base64');
// El nombre que pone macOS a la captura trae el día en que se aprobó: Cenit lo propone como Fecha.
const file = (name = 'Captura de pantalla 2026-11-20 a la(s) 10.15.32.png') => ({ name, mimeType: 'image/png', buffer: png });
const recovered = (value: string) => ({ status: 'recovered' as const, value, rawText: value });
function result(requestNumber: string, description: string, provider = 'Proveedor Ficticio A'): ExtractionResponse {
  const response = structuredClone(recoveredExample);
  response.data.captureLayout = { status: 'compatible', signals: ['request_title', 'header_fields', 'line_section', 'eight_column_table'] };
  response.data.origin = { type: 'image_capture', extractionId: response.data.extractionId, processorVersion: 'ppocr5-latin-grid8-layout-v2', processedAt: new Date().toISOString(), receipt: 'A'.repeat(43) };
  response.data.regions = [
    { path: '/header/description', x: .1, y: .2, width: .7, height: .15 },
    { path: '/lines/0/costCenter', x: .1, y: .65, width: .4, height: .15 },
  ];
  response.data.header.requestNumber = recovered(requestNumber);
  response.data.header.description = recovered(description);
  response.data.lines[0]!.provider = recovered(provider);
  return response;
}
const field = (page: Page, key: string) => page.locator(`#purchase-record-${key}`);
const picker = (page: Page) => page.getByLabel('Capturas de las solicitudes de compra', { exact: true });
async function open(page: Page) {
  await login(page, 'administrativo');
  await page.goto('/administracion/compras');
  await page.getByRole('link', { name: 'Registrar capturas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registrar capturas', exact: true })).toBeVisible();
}
// Cenit valida el comprobante de cada lectura; en estas pruebas el guardado se responde aquí, con la forma del contrato.
async function acceptSaves(page: Page, saves: CreatePurchase[]) {
  await page.route(/\/api\/v1\/purchases$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as CreatePurchase;
    saves.push(body);
    const origin = body.origin as Extract<CreatePurchase['origin'], { type: 'image_capture' }>;
    await route.fulfill({ status: 201, json: { data: { record: body.record, oracle: body.oracle, lines: body.lines, id: randomUUID(), source: 'image_capture', exampleId: null,
      capture: { type: 'image_capture', extractionId: origin.extractionId, processorVersion: origin.processorVersion, processedAt: origin.processedAt },
      version: 1, createdAt: new Date().toISOString(), createdBy: { id: randomUUID(), name: 'Administrativo de prueba' } } } });
  });
}

test('capturas: valida cada archivo, las lee de a una y guarda la cola con Enter', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/providers?**', route => route.fulfill({ json: { data: [
    { provider: 'Proveedor Ficticio A', rut: '76918240-3', requestNumber: 'HIST-RUT', recordDate: '2026-01-15',
      unitCode: '270101', projectCode: '00000000', accountingCode: '420405' },
  ] } }));
  const noRut = `Proveedor sin RUT ${randomUUID().slice(0, 6)}`;
  let calls = 0, reading = 0, most = 0;
  await page.route('**/api/v1/purchases/extractions', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
    calls++; reading++; most = Math.max(most, reading);
    await new Promise(resolve => setTimeout(resolve, 150));
    reading--;
    await route.fulfill({ json: calls === 1 ? result('CAP-001', 'HONORARIOS DOCENCIA FICTICIA, BOL/31, DEPTO SALUD PUBLICA_769182403') : result('CAP-002', 'INSUMOS FICTICIOS, COT. 41', noRut) });
  });
  const saves: CreatePurchase[] = [];
  await acceptSaves(page, saves);
  const huge = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 5001; canvas.height = 4000; return canvas.toDataURL('image/png').split(',')[1]!; });
  await picker(page).setInputFiles([
    { name: 'archivo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake') },
    { ...file('grande.png'), buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
    { ...file('rota.png'), buffer: Buffer.from('not a png') },
    { ...file('enorme.png'), buffer: Buffer.from(huge, 'base64') },
    file(), file('Captura de pantalla 2026-11-21 a la(s) 09.02.11.png'),
  ]);
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('No se agregaron 4 imágenes');
  for (const message of ['PNG o JPEG', '5 MiB', 'No se pudo abrir', '20 megapíxeles']) await expect(notice).toContainText(message);
  const queue = page.getByRole('navigation', { name: 'Capturas por revisar', exact: true });
  await expect(queue.locator('.capture-queue__item')).toHaveCount(2);

  // La primera: Fecha del nombre del archivo; RUT, bi, Tipo documento y UNIDAD desde el DETALLE.
  await expect(field(page, 'requestNumber')).toHaveValue('CAP-001');
  await expect(field(page, 'recordDate')).toHaveValue('20/11/2026');
  await expect(field(page, 'rut')).toHaveValue('76.918.240-3');
  await expect(page.locator('#purchase-record-rut-hint')).toHaveText('Del texto de la solicitud');
  await expect(field(page, 'bi')).toHaveValue('31');
  await expect(field(page, 'documentType')).toHaveValue('HONORARIOS');
  await expect(field(page, 'area')).toHaveValue('SALUD PUBLICA');
  await expect(page.getByRole('img', { name: /^Recorte de la captura: / })).toBeVisible();
  await expect(queue.getByText('RUT sin dato · opcional', { exact: true })).toBeVisible();
  expect(saves).toHaveLength(0);
  for (const width of [1440, 1280, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const key of ['recordDate', 'rut', 'documentType']) {
      expect(await field(page, key).evaluate(input => {
        const field = input as HTMLInputElement, style = getComputedStyle(field);
        const canvas = document.createElement('canvas').getContext('2d')!;
        canvas.font = style.font;
        return field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) >= canvas.measureText(field.value).width;
      })).toBe(true);
    }
    await page.screenshot({ path: `tmp/capture-queue-${width}.png`, fullPage: true });
  }

  await page.getByRole('button', { name: /^Guardar y seguir/ }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]!.origin).toMatchObject({ type: 'image_capture', receipt: 'A'.repeat(43) });
  expect(saves[0]!.record).toMatchObject({ requestNumber: 'CAP-001', recordDate: '2026-11-20', rut: '76918240-3', bi: '31', documentType: 'HONORARIOS', area: 'SALUD PUBLICA', paymentSituation: 'PENDIENTE' });
  // La segunda no trae RUT: el foco queda en él para escribirlo o seguir con Enter.
  await expect(page.locator('#purchase-record-rut-hint')).toHaveText('No viene en la captura. Es opcional.');
  await expect(field(page, 'requestNumber')).toHaveValue('CAP-002');
  await expect(field(page, 'recordDate')).toHaveValue('21/11/2026');
  await expect(field(page, 'rut')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Listo, revisaste todas las capturas', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Listo, revisaste todas las capturas', exact: true })).toBeFocused();
  await expect(queue.getByText('Guardada', { exact: true })).toHaveCount(2);
  expect(saves).toHaveLength(2);
  expect(saves[1]!.record.rut).toBeNull();
  expect(saves[0]!.operationId).not.toBe(saves[1]!.operationId);
  expect(calls).toBe(2); expect(most).toBe(1);
});

test('capturas: una lectura fallida se reintenta o se completa a mano; cancelar, quitar y salir piden confirmación', async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route('**/api/v1/purchases/extractions', route => {
    calls++;
    return calls !== 2 ? route.fulfill({ status: 503, json: { error: { code: 'EXTRACTION_UNAVAILABLE', message: 'El procesador no está disponible.', requestId: 'capture-test' } } })
      : route.fulfill({ json: result('CAP-010', 'INSUMOS FICTICIOS, COT. 7') });
  });
  await page.getByRole('button', { name: /Elegir capturas/ }).focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(file('primera.png'));
  await expect(page.getByRole('heading', { name: 'No pudimos leer esta captura', exact: true })).toBeVisible();
  await expect(page.getByText('El procesador no está disponible.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar la lectura', exact: true }).click();
  await expect(field(page, 'requestNumber')).toHaveValue('CAP-010');

  await picker(page).setInputFiles(file('segunda.png'));
  await page.getByRole('button', { name: /^Captura 2/ }).click();
  await expect(page.getByRole('heading', { name: 'No pudimos leer esta captura', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Completarla a mano con la imagen al lado', exact: true }).click();
  await expect(field(page, 'requestNumber')).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Imagen y datos extraídos', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^CAP-010/ }).click();
  await page.getByRole('button', { name: 'Quitar primera.png', exact: true }).click();
  const cancel = page.getByRole('alertdialog', { name: 'Cancelar esta captura' });
  await cancel.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page.getByRole('button', { name: /^CAP-010/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await cancel.getByRole('button', { name: 'Cancelar captura', exact: true }).click();
  await expect(page.getByRole('button', { name: /^CAP-010/ })).toHaveCount(0);
  await expect(field(page, 'requestNumber')).toHaveValue('');

  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Descartar cambios' });
  await discard.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page).toHaveURL(/\/compras\/captura$/);
  await page.getByRole('link', { name: 'Volver al registro', exact: true }).click();
  await discard.getByRole('button', { name: 'Descartar y salir', exact: true }).click();
  await expect(page).toHaveURL(/\/compras$/);
});

test('capturas: un guardado fallido conserva la fila y la operación; la sesión vencida no restaura la cola', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result('CAP-020', 'INSUMOS FICTICIOS, COT. 9') }));
  const attempts: CreatePurchase[] = [];
  await page.route(/\/api\/v1\/purchases$/, route => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'No disponible', requestId: 'capture-retry' } } });
  });
  await picker(page).setInputFiles(file());
  await field(page, 'description').fill('Corrección conservada tras fallo temporal');
  await page.getByRole('button', { name: /^Guardar y seguir/ }).click();
  await expect(page.getByRole('alert')).toContainText('La fila sigue aquí');
  await expect(field(page, 'description')).toHaveValue('Corrección conservada tras fallo temporal');
  // Un fallo al comprobar la sesión oculta la cola y la recupera en la misma cuenta.
  await page.route('**/api/v1/auth/session', route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toHaveText('No se pudo comprobar la sesión. Intenta nuevamente.');
  await expect(field(page, 'description')).toHaveCount(0);
  await page.unroute('**/api/v1/auth/session'); await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(field(page, 'description')).toHaveValue('Corrección conservada tras fallo temporal');
  await page.getByRole('button', { name: /^Guardar y seguir/ }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toEqual(attempts[0]);

  await page.evaluate(() => window.dispatchEvent(new Event('cenit:unauthenticated')));
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  // La cookie del servidor sigue vigente en este vencimiento simulado del cliente; se cierra explícitamente.
  expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} })).status()).toBe(204);
  await login(page, 'docente'); await page.goto('/administracion/compras/captura');
  await expect(page).toHaveURL(/\/academico$/);
  expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} })).status()).toBe(204);
  await page.goto('/login'); await login(page, 'administrativo'); await page.goto('/administracion/compras/captura');
  await expect(page.getByRole('button', { name: /Elegir capturas/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Capturas por revisar', exact: true })).toHaveCount(0);
});

test('capturas: la lupa sigue al campo y la captura completa lleva de un recuadro a su campo, con zoom y recuadros ocultables', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/purchases/extractions', route => route.fulfill({ json: result('CAP-030', 'INSUMOS FICTICIOS, COT. 3') }));
  await picker(page).setInputFiles(file('captura-sin-fecha.png'));
  const description = field(page, 'description');
  const lens = page.getByRole('region', { name: 'Así aparece en la captura', exact: true });
  const expand = lens.getByRole('button', { name: 'Ver captura completa', exact: true });
  const sheet = page.getByRole('dialog', { name: 'Captura completa · CAP-030', exact: true });
  const region = sheet.getByRole('button', { name: 'Ver campo: DETALLE', exact: true });
  await description.focus();
  await expect(lens).toContainText('En la captura: DETALLE');
  await expect(lens.getByRole('img', { name: 'Recorte de la captura: DETALLE', exact: true })).toBeVisible();
  await expect(lens.getByRole('img')).toHaveCSS('transition-duration', '0s');
  await field(page, 'recordDate').focus();
  await expect(page.locator('#purchase-record-recordDate-hint')).toHaveText('De la última modificación del archivo');
  await field(page, 'recordDate').fill('26/11/2026');
  await expect(page.locator('#purchase-record-recordDate-hint')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expand.click();
  await inspectSlowPanel(sheet, 'tmp/purchase-capture-viewer-slow.png');
  await expect(region).toHaveAttribute('data-active', 'false');
  await expect(sheet.getByRole('button', { name: /Centro de costos/ })).toHaveCount(0);
  const reference = sheet.locator('.capture-region--reference[title="Línea 1 · Centro de costos"]');
  await expect(reference).toHaveCSS('border-style', 'dashed');
  const box = (await reference.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Acercar imagen', exact: true }).click();
  await expect(sheet.locator('.capture-preview__image')).toHaveAttribute('data-zoom', '1.5');
  await sheet.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await expect(sheet.locator('.capture-preview__image')).toHaveAttribute('data-zoom', '1');
  await sheet.getByRole('button', { name: 'Ocultar recuadros', exact: true }).click(); await expect(region).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Mostrar recuadros', exact: true }).click(); await expect(region).toBeVisible();
  // Elegir un recuadro cierra el panel y deja el foco en su campo; Escape lo cierra y vuelve al botón.
  await region.click();
  await expect(sheet).toHaveCount(0); await expect(description).toBeFocused();
  await expand.click(); await expect(region).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0); await expect(expand).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expand.press('Enter');
  await expect(sheet).toHaveCSS('transition-property', 'opacity');
  await expect(sheet).toHaveCSS('translate', 'none');
});

test('captura real: subir, revisar, guardar y abrir la ficha mediante el OCR local', async ({ page }) => {
  test.skip(process.env.CENIT_E2E_REAL_OCR !== '1', 'Ensayo explícito separado; requiere OCR real y captura ficticia.');
  test.setTimeout(90000);
  await open(page);
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/purchases/extractions') && r.request().method() === 'POST');
  await picker(page).setInputFiles({ name: 'Captura de pantalla 2026-10-12 a la(s) 10.00.00.png', mimeType: 'image/png', buffer: readFileSync('tmp/ocr-oracle-format/01-completa.png') });
  const extraction = await response;
  expect(extraction.status()).toBe(200);
  const data = (await extraction.json()).data as ExtractionResponse['data'];
  expect(data.regions!.some(region => region.path === '/header/description')).toBe(true);
  await expect(field(page, 'requestNumber')).not.toHaveValue('');
  await page.screenshot({ path: 'tmp/capture-real-desktop.png', fullPage: true });
  await field(page, 'description').fill('Captura ficticia revisada desde el navegador');
  await page.getByRole('button', { name: /^Guardar y seguir/ }).click();
  await page.getByRole('link', { name: 'Ver la compra', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Captura ficticia revisada desde el navegador', { exact: true })).toBeVisible();
});
