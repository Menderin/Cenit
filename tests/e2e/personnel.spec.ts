import { test, expect, type Page } from '@playwright/test';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { login } from './support/browser.js';

const endpoint = '**/api/v1/personnel/service-commissions/pdf';
const section = (page: Page, name: string) => page.getByRole('navigation', { name: 'Secciones' }).getByRole('button').filter({ hasText: name });

test('Personal abre con Compras pendiente y conserva la geometría de las tarjetas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  let releaseCapabilities!: () => void;
  const capabilities = new Promise<void>(resolve => { releaseCapabilities = resolve; });
  await page.route('**/api/v1/purchases/capabilities', async route => {
    await capabilities;
    await route.abort().catch(() => {});
  });
  let releaseImages!: () => void;
  const images = new Promise<void>(resolve => { releaseImages = resolve; });
  await page.route(/\/(?:commission|leave)-template[^/]*\.svg$/, async route => {
    await images;
    await route.continue().catch(() => {});
  });
  try {
    await login(page, 'administrativo');
    await page.getByRole('link', { name: 'Personal', exact: true }).click();
    const cards = page.locator('.personnel-documents .cenit-form-template');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute('data-state', 'loading');
    await expect(cards.last()).toHaveAttribute('data-state', 'loading');
    const dimensions = () => cards.evaluateAll(items => items.map(el => [el.clientWidth, el.clientHeight]));
    const waiting = await dimensions();
    expect(waiting.every(([, height]) => height! > 200)).toBe(true);
    releaseImages();
    await expect(cards.first()).toHaveAttribute('data-state', 'ready');
    await expect(cards.last()).toHaveAttribute('data-state', 'ready');
    expect(await dimensions()).toEqual(waiting);
  } finally {
    releaseCapabilities();
    releaseImages();
  }
});

test('la vista previa de comisión conserva su tamaño mientras carga la plantilla', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  let releaseImage!: () => void;
  const image = new Promise<void>(resolve => { releaseImage = resolve; });
  await page.route(/\/commission-template[^/]*\.svg$/, async route => {
    await image;
    await route.continue().catch(() => {});
  });
  try {
    // Abrir el formulario directamente evita reutilizar el SVG de la tarjeta de Personal.
    await login(page, 'administrativo');
    await page.goto('/administracion/personal/comision');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const paper = page.getByRole('article', { name: 'Documento de comisión de servicios' });
    await expect(paper.getByRole('status')).toHaveText('Cargando la plantilla del documento…');
    const previewHeight = await paper.evaluate(el => el.clientHeight);
    releaseImage();
    await expect(paper.getByRole('img')).toBeVisible();
    expect(await paper.evaluate(el => el.clientHeight)).toBe(previewHeight);
  } finally {
    releaseImage();
  }
});

async function fillCommission(page: Page, signedIn = false) {
  if (!signedIn) await login(page, 'administrativo');
  await page.goto('/administracion/personal/comision');
  await page.getByLabel('Nombre completo', { exact: true }).fill('María Ejemplo');
  await page.getByLabel('Cargo', { exact: true }).fill('Docente');
  await page.getByLabel('Unidad o dependencia', { exact: true }).fill('Facultad ficticia');
  await page.getByRole('group', { name: 'Grupo', exact: true }).getByLabel('I', { exact: true }).check();
  await page.getByRole('group', { name: 'Estamento', exact: true }).getByLabel('Académico', { exact: true }).check();
  await page.getByRole('group', { name: 'Planta', exact: true }).getByLabel('Oficial', { exact: true }).check();
  await page.getByRole('button', { name: 'Continuar a Comisión' }).click();
  await page.getByLabel('Territorio nacional', { exact: true }).check();
  await page.getByLabel('Lugar', { exact: true }).fill('Antofagasta');
  await page.getByLabel('Desde', { exact: true }).fill('10/11/2026');
  await page.getByLabel('Hasta', { exact: true }).fill('11/11/2026');
  await page.getByLabel('Total de días', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Continuar a Financiamiento' }).click();
  for (const [name, value] of Object.entries({ institución: '0001', organización: '02', unidad: '000003', proyecto: '00000004', porcentaje: '100' })) {
    await page.getByLabel(`Fuente 1, ${name}`, { exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Continuar a Actividad' }).click();
  await page.getByLabel('Nombre del evento', { exact: true }).fill('Congreso ficticio');
  await page.getByLabel('Institución organizadora', { exact: true }).fill('Institución ficticia');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisión', exact: true })).toBeVisible();
}
function pdfInstructions(pdf: PDFDocument) {
  const contents = pdf.getPage(0).node.Contents() as PDFArray;
  const stream = contents.lookup(0) as PDFRawStream;
  return inflateSync(stream.getContents()).toString('latin1');
}

test('comisión: valida con teclado y descarga el PDF real', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/personal/comision');
  await page.getByRole('button', { name: 'Continuar a Comisión' }).press('Enter');
  await expect(page.getByLabel('Nombre completo', { exact: true })).toBeFocused();
  await page.reload();
  // La recarga anterior no prepara datos; el recorrido siguiente usa sólo datos ficticios.
  await fillCommission(page, true);
  const response = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).press('Enter');
  expect((await response).status()).toBe(200);
  const file = await download;
  expect(file.suggestedFilename()).toContain('comision-servicios');
  const pdf = await PDFDocument.load(await readFile((await file.path())!));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  const content = pdfInstructions(pdf);
  expect(content).toContain('<4D4152CD4120454A454D504C4F> Tj');
  expect(content).toContain('<424F525241444F52> Tj');
  await expect(page.getByText('María Ejemplo', { exact: true }).first()).toBeVisible();
});

const unprintable = /un carácter que no se puede imprimir en el documento\./;

test('comisión: errores del servidor enfocan el campo y el reintento conserva datos', async ({ page }) => {
  await fillCommission(page);
  await section(page, 'Funcionario').click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('María 🐙');
  await page.getByLabel('Cargo', { exact: true }).fill('Docente 🐙');
  await section(page, 'Revisión').click();
  const response = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  expect((await response).status()).toBe(422);
  await expect(page.getByLabel('Nombre completo', { exact: true })).toBeFocused();
  await expect(page.getByText(unprintable)).toHaveCount(2);
  await page.getByLabel('Nombre completo', { exact: true }).fill('María Ejemplo');
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(unprintable)).toHaveCount(1);
  await section(page, 'Revisión').click();
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByLabel('Cargo', { exact: true })).toBeFocused();
  await expect(page.getByText(unprintable)).toHaveCount(1);
  await page.getByLabel('Cargo', { exact: true }).fill('Docente');
  await expect(page.getByText(unprintable)).toHaveCount(0);
  await page.getByLabel('Nombre completo', { exact: true }).fill('X'.repeat(500));
  await section(page, 'Revisión').click();
  const tooLong = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  expect((await tooLong).status()).toBe(422);
  await expect(page.getByLabel('Nombre completo', { exact: true })).toBeFocused();
  await expect(page.getByText('El texto no cabe en el documento; acórtalo.')).toBeVisible();
  await expect(page.getByLabel('Nombre completo', { exact: true })).toHaveValue('X'.repeat(500));
  await page.getByLabel('Nombre completo', { exact: true }).fill('María Ejemplo');
  await section(page, 'Revisión').click();
  await page.route(endpoint, route => route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible.', requestId: 'test' } } }));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  await expect(page.getByText('María Ejemplo', { exact: true }).first()).toBeVisible();
  await page.unroute(endpoint);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('comision-servicios');
});

test('comisión: solicita el PDF del servidor y prepara la impresión', async ({ page }) => {
  // El visor PDF es nativo y puede ejecutarse fuera del contexto de scripts de la página.
  await page.addInitScript(() => {
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLIFrameElement && node.title === 'Imprimir comisión de servicios' && node.src.startsWith('blob:')) {
          document.documentElement.dataset.commissionPrintPrepared = 'yes';
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await fillCommission(page);
  const response = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.commissionPrintPrepared)).toBe('yes');
});

test('comisión: financiamiento muestra todos los campos en cada ancho', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/personal/comision');
  await section(page, 'Financiamiento').click();
  const funding = page.getByRole('region', { name: 'Código presupuestario' });
  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await funding.evaluate(region => {
      const rect = region.getBoundingClientRect();
      const inputs = [...region.querySelectorAll('input')];
      return { scroll: region.scrollWidth, width: region.clientWidth, count: inputs.length,
        percentWidth: inputs[4]!.getBoundingClientRect().width, projectWidth: inputs[3]!.getBoundingClientRect().width,
        visible: inputs.every(input => { const field = input.getBoundingClientRect(); return field.width > 0 && field.left >= rect.left - 1 && field.right <= rect.right + 1; }) };
    });
    expect(layout.count).toBe(10);
    expect(layout.scroll, `desbordamiento a ${width}px`).toBeLessThanOrEqual(layout.width);
    expect(layout.visible, `campos cortados a ${width}px`).toBe(true);
    expect(layout.percentWidth, `porcentaje debe ocupar menos espacio a ${width}px`).toBeLessThan(layout.projectWidth);
  }
});

test('comisión: cancelar una respuesta tardía y revisar la vista previa', async ({ page }) => {
  await fillCommission(page);
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByText('Vista previa aproximada; el documento final se genera al descargar o imprimir.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Volver al formulario' }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let downloads = 0, finished!: () => void;
  const handled = new Promise<void>(resolve => { finished = resolve; });
  page.on('download', () => { downloads++; });
  await page.route(endpoint, async route => {
    await gate;
    try { await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-respuesta-tardia' }); } catch { /* La solicitud ya fue cancelada. */ }
    finally { finished(); }
  });
  const pending = page.waitForRequest(endpoint);
  const actions = page.locator('.personnel-download__actions');
  const dimensions = () => actions.evaluate(el => [el.clientWidth, el.clientHeight]);
  const readySize = await dimensions();
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await pending;
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  expect(await dimensions()).toEqual(readySize);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  release();
  await handled;
  await expect(page.getByRole('alert')).toContainText('Preparación cancelada');
  await expect(page.getByText('María Ejemplo', { exact: true }).first()).toBeVisible();
  expect(downloads).toBe(0);
});


test('comisión: al cerrar sesión cancela la respuesta pendiente', async ({ page }) => {
  await fillCommission(page);
  let release!: () => void, finished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const handled = new Promise<void>(resolve => { finished = resolve; });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.route(endpoint, async route => {
    await gate;
    try { await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-respuesta-tardia' }); } catch { /* La solicitud fue cancelada. */ }
    finally { finished(); }
  });
  const pending = page.waitForRequest(endpoint);
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await pending;
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Descartar cambios' }).getByRole('button', { name: 'Descartar y salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
  release(); await handled;
  expect(downloads).toBe(0);
  await expect(page.getByText('María Ejemplo')).toHaveCount(0);
});


test('comisión: un 401 invalida la sesión sin descargar', async ({ page }) => {
  await fillCommission(page);
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.route(endpoint, route => route.fulfill({ status: 401, json: { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sesión vencida.', requestId: 'test' } } }));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('María Ejemplo')).toHaveCount(0);
  expect(downloads).toBe(0);
});


test('comisión: editar el borrador cancela la respuesta pendiente', async ({ page }) => {
  await fillCommission(page);
  let release!: () => void, finished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const handled = new Promise<void>(resolve => { finished = resolve; });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.route(endpoint, async route => {
    await gate;
    try { await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-respuesta-tardia' }); } catch { /* La solicitud fue cancelada. */ }
    finally { finished(); }
  });
  const pending = page.waitForRequest(endpoint);
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await pending;
  await section(page, 'Funcionario').click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('Nombre modificado');
  release(); await handled;
  await expect(page.getByLabel('Nombre completo', { exact: true })).toHaveValue('Nombre modificado');
  expect(downloads).toBe(0);
});

test('personal: la entrada lleva a cada documento', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/personal');
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Solicitud de permiso/ }).click();
  await expect(page).toHaveURL(/\/administracion\/personal\/permiso$/);
  await expect(page.getByRole('heading', { name: 'Nueva solicitud de permiso' })).toBeVisible();
  const location = page.getByRole('navigation', { name: 'Ubicación' });
  await expect(location.getByRole('link', { name: 'Personal' })).toBeVisible();
  await expect(location.getByText('Solicitud de permiso')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Cambiar de documento' }).click();
  await expect(page).toHaveURL(/\/administracion\/personal$/);
  await page.getByRole('link', { name: /Comisión de servicios/ }).click();
  await expect(page).toHaveURL(/\/administracion\/personal\/comision$/);
  await expect(page.getByRole('heading', { name: 'Nueva comisión de servicios' })).toBeVisible();
  await location.getByRole('link', { name: 'Personal' }).click();
  await expect(page).toHaveURL(/\/administracion\/personal$/);
});

const leaveEndpoint = '**/api/v1/personnel/leave-requests/pdf';
async function fillLeave(page: Page) {
  await login(page, 'administrativo');
  await page.goto('/administracion/personal/permiso');
  await page.getByLabel('Nombre del funcionario', { exact: true }).fill('Camila');
  await page.getByRole('option', { name: /Camila Soto Araya/ }).click();
  await expect(page.getByLabel('RUT', { exact: true })).toHaveValue('15.482.903-2');
  await page.getByLabel('RUT', { exact: true }).fill('154829032');
  await expect(page.getByLabel('RUT', { exact: true })).toHaveValue('15.482.903-2');
  await page.getByRole('button', { name: 'Continuar a Permiso' }).click();
}

test('permiso: valida con teclado, pide horario sólo por hora y descarga el PDF real', async ({ page }) => {
  await fillLeave(page);
  await page.getByRole('button', { name: 'Revisar', exact: true }).press('Enter');
  await expect(page.getByLabel('Día administrativo', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Horas', { exact: true })).toHaveCount(0);
  await page.getByLabel('Por hora', { exact: true }).check();
  await page.getByLabel('Desde', { exact: true }).fill('20/11/2026');
  await page.getByLabel('Hasta', { exact: true }).fill('20/11/2026');
  await page.getByLabel('Horas', { exact: true }).fill('2');
  await page.getByLabel('Minutos', { exact: true }).fill('30');
  await page.getByLabel('Desde las', { exact: true }).fill('09:15');
  await page.getByLabel('Hasta las', { exact: true }).fill('11:45');
  await page.getByLabel('Fecha de recuperación del permiso', { exact: true }).fill('27/11/2026');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisión', exact: true })).toBeVisible();
  await expect(page.getByText('09:15 a 11:45 h').first()).toBeVisible();
  const response = page.waitForResponse(resp => resp.url().endsWith('/leave-requests/pdf'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).press('Enter');
  expect((await response).status()).toBe(200);
  const file = await download;
  expect(file.suggestedFilename()).toBe('solicitud-permiso-soto-araya-2026-11-20.pdf');
  const pdf = await PDFDocument.load(await readFile((await file.path())!));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  const content = pdfInstructions(pdf);
  expect(content).toContain('<43414D494C4120534F544F204152415941> Tj');
  expect(content).toContain('<30393A3135> Tj');
  expect(content).toContain('<424F525241444F52> Tj');
});

test('permiso: errores del servidor vuelven al campo y conservan los datos', async ({ page }) => {
  await fillLeave(page);
  await page.getByLabel('Teletrabajo', { exact: true }).check();
  await page.getByLabel('Desde', { exact: true }).fill('20/11/2026');
  await page.getByLabel('Hasta', { exact: true }).fill('21/11/2026');
  await page.getByLabel('Observaciones (opcional)', { exact: true }).fill('Texto ficticio');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await page.route(leaveEndpoint, route => route.fulfill({ status: 422, json: { error: { code: 'VALIDATION_ERROR', message: 'Revisa los campos indicados.', requestId: 'test', fields: { notes: 'El texto no cabe en la plantilla; acórtalo.' } } } }));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El formulario conserva tus datos');
  await expect(page.getByLabel('Observaciones (opcional)', { exact: true })).toBeFocused();
  await expect(page.getByText('El texto no cabe en la plantilla; acórtalo.')).toBeVisible();
  await expect(page.getByLabel('Observaciones (opcional)', { exact: true })).toHaveValue('Texto ficticio');
});

test('formato al escribir: viático con miles y fecha que se borra de corrido', async ({ page }) => {
  await login(page, 'administrativo');
  await page.goto('/administracion/personal/comision');
  await section(page, 'Comisión').click();
  await page.getByLabel('Importe del viático (opcional)', { exact: true }).fill('186000');
  await expect(page.getByLabel('Importe del viático (opcional)', { exact: true })).toHaveValue('186.000');
  const from = page.getByLabel('Desde', { exact: true });
  await from.pressSequentially('10112026');
  await expect(from).toHaveValue('10/11/2026');
  await from.press('End');
  for (let i = 0; i < 5; i++) await from.press('Backspace');
  await expect(from).toHaveValue('10/1');
  for (let i = 0; i < 3; i++) await from.press('Backspace');
  await expect(from).toHaveValue('');
});
