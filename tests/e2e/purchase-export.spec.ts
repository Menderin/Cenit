import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { login } from './support/browser.js';
import { manualPurchaseExample } from '../../packages/contracts/src/purchases/record-examples.js';

const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('descarga por teclado, conserva filtros pendientes y informa fallos sin éxito', async ({ page }) => {
  await page.route('**/api/v1/purchases/capabilities', route => route.fulfill({ json: { data: { secondReviewEnabled: false, sheetsSyncEnabled: false } } }));
  await page.route('**/api/v1/purchases/export.xlsx*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('q') === 'fallo') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'La exportación no está disponible.' } }) });
      return;
    }
    if (url.searchParams.get('q') === 'sesion') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Sesión vencida.' } }) });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Compras');
    await route.fulfill({ status: 200, contentType: xlsxType, body: await workbook.xlsx.writeBuffer() });
  });
  await page.route('**/api/v1/purchases*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/purchases')) {
      await route.continue();
      return;
    }
    await route.fulfill({ json: {
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0 },
      availableYears: [],
      totals: { currency: 'CLP', documentTotal: '0' },
    } });
  });

  await login(page, 'administrativo');
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  const button = page.getByRole('button', { name: 'Descargar Excel', exact: true });
  await button.focus();
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('compras.xlsx');
  await expect(page.getByText('Archivo descargado', { exact: true })).toBeVisible();

  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('borrador-no-aplicado');
  const exportRequest = page.waitForRequest(request => request.url().includes('/export.xlsx'));
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const exportUrl = (await exportRequest).url();
  expect(new URL(exportUrl).searchParams.has('q')).toBe(false);

  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('fallo');
  await page.waitForURL(/q=fallo/);
  await expect(button).toBeEnabled();
  const failedExport = page.waitForResponse(response => response.url().includes('/export.xlsx') && response.url().includes('q=fallo'));
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  expect((await failedExport).status()).toBe(503);
  await expect(page.getByText('No se pudo descargar el archivo', { exact: true })).toBeVisible();
  await expect(page.getByText('Archivo descargado', { exact: true })).toHaveCount(0);

  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('sesion');
  await page.waitForURL(/q=sesion/);
  await expect(button).toBeEnabled();
  const expiredExport = page.waitForResponse(response => response.url().includes('/export.xlsx') && response.url().includes('q=sesion'));
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  expect((await expiredExport).status()).toBe(401);
  await expect(page.getByText('La sesión venció', { exact: true })).toBeVisible();
});

test('descarga de varias páginas exporta todas las compras y se adapta a móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'administrativo');
  await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
  const origin = new URL(page.url()).origin;
  const prefix = `EXPORT-${crypto.randomUUID().slice(0, 8)}`;
  const ids = new Set<string>();
  for (let i = 0; i < 21; i++) {
    const input = structuredClone(manualPurchaseExample);
    input.operationId = crypto.randomUUID();
    input.header.requestNumber = `${prefix}-${i}`;
    const saved = await page.request.post('/api/v1/purchases', { headers: { origin }, data: input });
    expect(saved.status()).toBe(201);
    ids.add(((await saved.json()) as { data: { id: string } }).data.id);
  }
  await page.getByLabel('Buscar solicitudes', { exact: true }).fill(prefix);
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Descargar Excel', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('compras.xlsx');
  const path = await file.path();
  expect(path).toBeTruthy();
  const workbook = await new ExcelJS.Workbook().xlsx.readFile(path!);
  const sheet = workbook.getWorksheet('Compras');
  expect(sheet).toBeTruthy();
  const exported = sheet!.getColumn(2).values.slice(1).filter((value): value is string => typeof value === 'string');
  for (let i = 0; i < 21; i++) expect(exported).toContain(`${prefix}-${i}`);
});
