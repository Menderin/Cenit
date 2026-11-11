import { test, expect, type Page } from '@playwright/test';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { login } from './support/browser.js';

const endpoint = '**/api/v1/personnel/service-commissions/pdf';
const section = (page: Page, name: string) => page.getByRole('navigation', { name: 'Secciones' }).getByRole('button').filter({ hasText: name });
async function fillCommission(page: Page, signedIn = false) {
  if (!signedIn) await login(page, 'administrativo');
  await page.goto('/administracion/personal');
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
  await page.goto('/administracion/personal');
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

test('comisión: errores del servidor enfocan el campo y el reintento conserva datos', async ({ page }) => {
  await fillCommission(page);
  await section(page, 'Funcionario').click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('María 🐙');
  await section(page, 'Revisión').click();
  const response = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  expect((await response).status()).toBe(422);
  await expect(page.getByLabel('Nombre completo', { exact: true })).toBeFocused();
  await expect(page.getByText('Contiene caracteres que no admite el documento.')).toBeVisible();
  await page.getByLabel('Nombre completo', { exact: true }).fill('X'.repeat(500));
  await section(page, 'Revisión').click();
  const tooLong = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  expect((await tooLong).status()).toBe(422);
  await expect(page.getByLabel('Nombre completo', { exact: true })).toBeFocused();
  await expect(page.getByText('El texto no cabe en la plantilla; acórtalo.')).toBeVisible();
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

test('comisión: solicita el PDF del servidor para imprimir', async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) window.addEventListener('message', event => { if (event.data === 'commission-print') document.documentElement.dataset.commissionPrinted = 'yes'; });
    else window.print = () => window.top?.postMessage('commission-print', '*');
  });
  await fillCommission(page);
  const response = page.waitForResponse(resp => resp.url().endsWith('/service-commissions/pdf'));
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('iframe[title="Imprimir comisión de servicios"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.commissionPrinted)).toBe('yes');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('comisión: cancelar una respuesta tardía y usar el formulario en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fillCommission(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Funcionario', 'Comisión', 'Financiamiento', 'Actividad', 'Revisión']) {
      await section(page, name).click();
      const bounds = await page.evaluate(() => ({
        viewport: innerWidth, width: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll<HTMLElement>('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => `${el.tagName}.${el.className}`).slice(0, 12),
      }));
      expect(bounds.width, `${width}px ${name}: ${bounds.overflowing.join(', ')}`).toBeLessThanOrEqual(bounds.viewport);
      if (width === 320 && name === 'Financiamiento') {
        const funding = page.getByRole('region', { name: 'Código presupuestario' });
        await funding.focus();
        await funding.press('ArrowRight');
        await expect.poll(() => funding.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      }
    }
  }
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
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await pending;
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
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
