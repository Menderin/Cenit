import { test, expect } from '@playwright/test';
import { login } from './support/browser.js';

const courses = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Ver asignatura:/ });
async function chooseStudent(page: import('@playwright/test').Page, name: string) {
  const change = page.getByRole('button', { name: 'Cambiar estudiante', exact: true });
  if (await change.isVisible()) await change.click();
  await page.locator('.academic-students__results').getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
for (const role of ['docente', 'estudiante']) {
  test(`catálogo PostgreSQL, recarga y trazabilidad de API: ${role}`, async ({ page }) => {
    await login(page, role);
    await expect(courses(page)).toHaveCount(52);
    const internados = page.getByRole('region', { name: 'Semestres IX–X', exact: true });
    await expect(internados.locator('button')).toHaveCount(4);
    await expect(internados).toContainText('65 SCT');
    const response = await page.request.get('/api/v1/academic/plans/nutricion-dietetica/versions/2027-r1');
    expect(response.status()).toBe(200);
    const data = (await response.json()).data;
    expect(data.courses).toHaveLength(52);
    expect(data.sources.map((source: { validationStatus: string }) => source.validationStatus)).toEqual(['teamReviewed', 'teamReviewed']);
    await page.reload(); await expect(courses(page)).toHaveCount(52);
  });
}

test('detalle con teclado, relaciones pendientes y ausencia desconocida', async ({ page }) => {
  await login(page); await expect(courses(page)).toHaveCount(52);
  const card = page.getByRole('button', { name: 'Ver asignatura: Inocuidad alimentaria', exact: true });
  await card.focus(); await card.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Inocuidad alimentaria' });
  await expect(dialog).toContainText('Interpretación pendiente');
  await expect(dialog).toContainText('Ciencia de los alimentos');
  await expect(dialog.getByRole('button', { name: 'Cerrar detalle' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(card).toBeFocused();
  await page.getByRole('button', { name: 'Ver asignatura: Formación general electiva I', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Esto no confirma la ausencia de prerrequisitos.');
  await expect(page.getByRole('dialog').getByText('Sin prerrequisitos.', { exact: true })).toHaveCount(0);
});

test('lista vacía válida y respuesta inválida no se sustituyen por datos fijos', async ({ page }) => {
  await page.route('**/api/v1/academic/plans', route => route.fulfill({ json: { data: [] } }));
  await login(page);
  await expect(page.getByRole('heading', { name: 'La malla todavía no está disponible' })).toBeVisible();
  await expect(courses(page)).toHaveCount(0);
  await page.unroute('**/api/v1/academic/plans');
  await page.route('**/api/v1/academic/plans/*/versions/*', route => route.fulfill({ json: { data: { courses: [] } } }));
  await page.getByRole('button', { name: 'Volver a consultar' }).click();
  await expect(page.getByRole('alert')).toHaveText('El servidor devolvió un catálogo inválido.');
  await expect(courses(page)).toHaveCount(0);
  await page.unroute('**/api/v1/academic/plans/*/versions/*');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(courses(page)).toHaveCount(52);
});

test('servicio caído permite reintentar; 401 limpia catálogo y detalle', async ({ page }) => {
  await page.route('**/api/v1/academic/plans', route => route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible.', requestId: 'test' } } }));
  await login(page);
  await expect(page.getByRole('alert')).toHaveText('El servicio no está disponible.');
  await page.unroute('**/api/v1/academic/plans');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(courses(page)).toHaveCount(52);
  await courses(page).first().click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.route('**/api/v1/academic/plans', route => route.fulfill({ status: 401, json: { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Debes iniciar sesión.', requestId: 'test' } } }));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
  await expect(courses(page)).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('administrativo y anónimo no obtienen el catálogo aunque entren directamente', async ({ page }) => {
  expect((await page.request.get('/api/v1/academic/plans')).status()).toBe(401);
  await login(page, 'administrativo');
  await page.goto('/academico'); await expect(page).toHaveURL(/\/administracion$/);
  expect((await page.request.get('/api/v1/academic/plans')).status()).toBe(403);
  await expect(courses(page)).toHaveCount(0);
});

test('respuesta de catálogo tardía no reaparece tras logout y cambio de cuenta', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/v1/academic/plans/*/versions/*', async route => {
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response }).catch(() => {});
  });
  const account = await login(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); release!();
  await expect(courses(page)).toHaveCount(0);
  await expect(page.getByText(account.name, { exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/academic/plans/*/versions/*');
  await login(page, 'estudiante'); await expect(courses(page)).toHaveCount(52);
});

test('estudiante consulta RUT, estados e intentos propios y el docente ve el mismo historial', async ({ page }, testInfo) => {
  await login(page, 'estudiante');
  const context = page.getByRole('region', { name: 'Avance curricular', exact: true });
  await expect(context).toContainText('00.000.001-k');
  const first = page.getByRole('button', { name: 'Ver asignatura: Ciencia de los alimentos', exact: true });
  await expect(first).toContainText('Aprobada · 5,2');
  await first.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Historial de intentos');
  await expect(dialog.getByRole('row')).toHaveCount(3);
  await expect(dialog.getByRole('row').nth(1)).toContainText('Reprobada');
  await expect(dialog.getByRole('row').nth(1)).toContainText('3,2');
  await expect(dialog.getByRole('row').nth(2)).toContainText('5,2');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: testInfo.outputPath('historial-1440.png') });
  await page.keyboard.press('Escape');
  await page.reload(); await expect(first).toContainText('Aprobada · 5,2');
  const own = await page.request.get('/api/v1/academic/me/progress'); expect(own.status()).toBe(200);
  const data = (await own.json()).data;
  expect((await page.request.get(`/api/v1/academic/students/${data.student.id}/progress`)).status()).toBe(403);
  expect((await page.request.get('/api/v1/academic/students')).status()).toBe(403);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await login(page);
  await page.getByRole('button', { name: /^Estudiante Demo 00/ }).click();
  await expect(context).toContainText('00.000.001-k');
  const teacher = await page.request.get(`/api/v1/academic/students/${data.student.id}/progress`);
  expect((await teacher.json()).data).toEqual(data);
});

test('docente busca tres perfiles por RUT/nombre y cambia de historial sin mezclar datos', async ({ page }, testInfo) => {
  await login(page);
  const results = page.locator('.academic-students__results');
  await expect(results.getByRole('button')).toHaveCount(3);
  await page.getByLabel('RUT', { exact: true }).fill('00000002-0');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(results.getByRole('button')).toHaveCount(1);
  await results.getByRole('button', { name: /^Camila Demo/ }).click();
  await expect(page.getByRole('region', { name: 'Avance curricular', exact: true })).toContainText('Camila Demo');
  const first = page.getByRole('button', { name: 'Ver asignatura: Ciencia de los alimentos', exact: true });
  await expect(first).toContainText('Aprobada · 6,5');
  await page.getByRole('button', { name: 'Cambiar estudiante', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Estudiante');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No hay estudiantes que coincidan');
  await expect(first).not.toContainText('Aprobada');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(results.getByRole('button')).toHaveCount(3);
  await chooseStudent(page, 'Tomás Demo');
  await expect(first).toContainText('Aprobada · 6');
  await chooseStudent(page, 'Estudiante Demo');
  await expect(first).toContainText('Aprobada · 5,2');
  await expect(page.getByRole('button', { name: 'Ver asignatura: Fundamentos biológicos para la nutrición', exact: true })).toContainText('Reprobada · 2,5');
  await page.getByRole('button', { name: 'Ver asignatura: Inglés 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sin intentos registrados');
  await page.keyboard.press('Escape');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => { document.querySelector('.academic-content')!.scrollTop = 0; document.querySelector('.academic-board')!.scrollLeft = 0; });
    await page.getByRole('heading', { name: 'Malla curricular', exact: true }).focus(); await page.mouse.move(0, 0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`avance-${viewport.width}.png`) });
  }
});

test('un historial tardío no sustituye al estudiante seleccionado después', async ({ page }) => {
  await login(page);
  let release: (() => void) | undefined;
  await page.route('**/api/v1/academic/students/10000000-0000-4000-8000-000000000003/progress', async route => {
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response }).catch(() => {});
  });
  await chooseStudent(page, 'Tomás Demo');
  await expect.poll(() => Boolean(release)).toBe(true);
  await chooseStudent(page, 'Camila Demo');
  const context = page.getByRole('region', { name: 'Avance curricular', exact: true });
  await expect(context).toContainText('Camila Demo');
  release!();
  await expect(context).not.toContainText('Tomás Demo');
  await expect(page.getByRole('button', { name: 'Ver asignatura: Ciencia de los alimentos', exact: true })).toContainText('Aprobada · 6,5');
});

test('historial ausente o inválido no se convierte a no cursado y permite reintentar', async ({ page }) => {
  await page.route('**/api/v1/academic/me/progress', route => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Perfil no encontrado.', requestId: 'test' } } }));
  await login(page, 'estudiante');
  await expect(page.getByRole('alert')).toContainText('perfil académico preparado');
  await expect(courses(page)).toHaveCount(52);
  await expect(page.locator('.academic-progress-badge')).toHaveCount(0);
  await page.unroute('**/api/v1/academic/me/progress');
  await page.route('**/api/v1/academic/me/progress', route => route.fulfill({ json: { data: { courses: [] } } }));
  await page.getByRole('button', { name: 'Reintentar historial', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('El servidor devolvió un historial inválido.');
  await expect(page.locator('.academic-progress-badge')).toHaveCount(0);
  await page.unroute('**/api/v1/academic/me/progress');
  await page.getByRole('button', { name: 'Reintentar historial', exact: true }).click();
  await expect(page.locator('.academic-progress-badge')).toHaveCount(52);
});

test('malla y detalle legibles al redimensionar sin overflow del documento', async ({ page }, testInfo) => {
  const account = await login(page); await expect(courses(page)).toHaveCount(52);
  for (const width of [1920, 1440, 1280, 1024, 768, 721, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 600 });
    if (width <= 720) await expect(page.locator('.academic-mobile-account')).toContainText(account.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `overflow a ${width}px`).toBe(true);
    if ([1920, 1440, 390].includes(width)) {
      const height = width === 1920 ? 1080 : width === 1440 ? 900 : 844;
      await page.setViewportSize({ width, height });
      await expect(page.locator('.academic-shell')).toHaveCount(1);
      await expect.poll(() => page.locator('.academic-shell').evaluate(element => Math.round(element.getBoundingClientRect().height))).toBe(height - (width <= 720 ? 20 : 32));
      await page.evaluate(() => { document.querySelector('.academic-content')!.scrollTop = 0; document.querySelector('.academic-board')!.scrollLeft = 0; });
      await page.getByRole('heading', { name: 'Malla curricular', exact: true }).focus();
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.screenshot({ path: testInfo.outputPath(`malla-${width}.png`) });
      await page.setViewportSize({ width, height: 600 });
    }
    await page.getByRole('button', { name: 'Ver asignatura: Introducción a los determinantes sociales de la salud y salud pública', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath('detalle-1440.png') });
    await page.keyboard.press('Escape');
    await expect(courses(page)).toHaveCount(52);
  }
});
