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
    await route.fulfill({ status: 200, contentType: xlsxType, body: Buffer.from(await workbook.xlsx.writeBuffer()) });
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
  // The dialog explains the file and its scope before anything is requested.
  await expect(page.getByRole('alertdialog', { name: 'Descargar Excel' })).toContainText('Compras, Ítems y Resumen');
  await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('compras.xlsx');
  await expect(page.getByText('Archivo descargado', { exact: true })).toBeVisible();

  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('borrador-no-aplicado');
  const exportRequest = page.waitForRequest(request => request.url().includes('/export.xlsx'));
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
  const exportUrl = (await exportRequest).url();
  expect(new URL(exportUrl).searchParams.has('q')).toBe(false);

  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('fallo');
  await page.waitForURL(/q=fallo/);
  await expect(button).toBeEnabled();
  const failedExport = page.waitForResponse(response => response.url().includes('/export.xlsx') && response.url().includes('q=fallo'));
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
  expect((await failedExport).status()).toBe(503);
  await expect(page.getByText('No se pudo descargar el archivo', { exact: true })).toBeVisible();
  await expect(page.getByText('Archivo descargado', { exact: true })).toHaveCount(0);

  await page.getByLabel('Buscar solicitudes', { exact: true }).fill('sesion');
  await page.waitForURL(/q=sesion/);
  await expect(button).toBeEnabled();
  const expiredExport = page.waitForResponse(response => response.url().includes('/export.xlsx') && response.url().includes('q=sesion'));
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
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
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('compras.xlsx');
  await file.saveAs('tmp/purchase-export/compras-ficticias.xlsx');
  const path = await file.path();
  expect(path).toBeTruthy();
  const workbook = await new ExcelJS.Workbook().xlsx.readFile(path!);
  const sheet = workbook.getWorksheet('Compras');
  expect(sheet).toBeTruthy();
  const exported = sheet!.getColumn(2).values.slice(1).filter((value): value is string => typeof value === 'string');
  for (let i = 0; i < 21; i++) expect(exported).toContain(`${prefix}-${i}`);
});

for (const exit of ['logout', 'expiry-and-account-change'] as const) {
  test(`descarga pendiente se descarta ante ${exit}`, async ({ page }) => {
    let release!: () => void;
    let completed!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const handled = new Promise<void>(resolve => { completed = resolve; });
    let requests = 0, downloads = 0;
    page.on('download', () => downloads++);
    await page.route('**/api/v1/purchases/export.xlsx*', async route => {
      requests++;
      await gate;
      try { await route.fulfill({ contentType: xlsxType, body: Buffer.from('respuesta tardía ficticia') }); }
      catch { /* The request was cancelled when the protected screen unmounted. */ }
      finally { completed(); }
    });
    await login(page, 'administrativo');
    await page.getByRole('link', { name: 'Ver registros', exact: true }).click();
    const requested = page.waitForRequest(request => request.url().includes('/export.xlsx'));
    await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
    await requested;
    const busy = page.getByRole('button', { name: 'Generando Excel…', exact: true });
    await expect(busy).toBeDisabled();
    await busy.evaluate((button: HTMLButtonElement) => button.click());
    expect(requests).toBe(1);
    if (exit === 'logout') {
      await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event('cenit:unauthenticated')));
      await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
      // Client-side invalidation is simulated; explicitly revoke its server cookie before changing account.
      expect((await page.request.post('/api/v1/auth/logout', { headers: { Origin: new URL(page.url()).origin }, data: {} })).status()).toBe(204);
      await login(page, 'docente');
    }
    release();
    await handled;
    await expect(page.getByText('Archivo descargado', { exact: true })).toHaveCount(0);
    expect(downloads).toBe(0);
  });
}

test('fechas incompletas o invertidas conservan los últimos filtros válidos al exportar', async ({ page }) => {
  await page.route(/\/api\/v1\/purchases\?/, route => route.fulfill({ json: {
    data: [], pagination: { page: 1, pageSize: 20, total: 0 }, availableYears: [2026],
    totals: { currency: 'CLP', documentTotal: '0' },
  } }));
  const queries: URLSearchParams[] = [];
  await page.route('**/api/v1/purchases/export.xlsx*', route => {
    queries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Fallo ficticio', requestId: 'export-date-review' } } });
  });
  await login(page, 'administrativo');
  await page.goto('/administracion/compras?dateFrom=2026-10-01&dateTo=2026-10-31');
  await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
  await page.getByLabel('Rango de fechas: desde, año', { exact: true }).fill('202');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
  await expect.poll(() => queries.length).toBe(1);
  expect(queries[0]!.get('dateFrom')).toBe('2026-10-01');
  expect(queries[0]!.get('dateTo')).toBe('2026-10-31');
  await page.getByLabel('Rango de fechas: desde, mes', { exact: true }).fill('11');
  await page.getByLabel('Rango de fechas: desde, año', { exact: true }).fill('2026');
  await expect(page.getByRole('button', { name: 'Descargar Excel', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click(); await page.getByRole('alertdialog', { name: 'Descargar Excel' }).getByRole('button', { name: 'Descargar archivo', exact: true }).click();
  await expect.poll(() => queries.length).toBe(2);
  expect(queries[1]!.get('dateFrom')).toBe('2026-10-01');
  expect(queries[1]!.get('dateTo')).toBe('2026-10-31');
});
