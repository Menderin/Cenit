import { test, expect } from '@playwright/test';
import { login } from './support/browser.js';
import { prerequisiteCases, prerequisitePlan } from './support/prerequisites.js';
import { relationPlan, relationProgress } from './support/academic-relations.js';

const courses = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Ver asignatura:/ });
async function chooseStudent(page: import('@playwright/test').Page, name: string) {
  await expect(page.locator('.academic-students')).toBeVisible();
  const change = page.getByRole('button', { name: /^Cambiar estudiante$/ });
  if (await change.isVisible()) await change.click();
  await page.locator('.academic-students__results').getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

async function expectLatestGrade(page: import('@playwright/test').Page, grade: string) {
  await page.getByRole('button', { name: 'Ver asignatura: Cs. alimentos (Ciencia de los alimentos)', exact: true }).click();
  const latest = page.getByRole('dialog').locator('.academic-facts').first().locator('div').filter({ has: page.getByText('Última nota', { exact: true }) }).locator('dd');
  await expect(latest).toHaveText(grade);
  await page.keyboard.press('Escape');
}

test('diez semestres: navegación visible en portátil', async ({ page }, testInfo) => {
  await page.route('**/api/v1/academic/plans', route => route.fulfill({ json: { data: [{ planId: relationPlan.planId, name: relationPlan.name, versions: [{ version: relationPlan.version, isExample: true }] }] } }));
  await page.route(`**/api/v1/academic/plans/*/versions/${relationPlan.version}`, route => route.fulfill({ json: { data: relationPlan } }));
  await page.route('**/api/v1/academic/me/progress', route => route.fulfill({ json: { data: relationProgress } }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page, 'estudiante');
  await expect(courses(page)).toHaveCount(50);
  const board = page.getByRole('region', { name: 'Asignaturas por semestre', exact: true });
  const previous = page.getByRole('button', { name: 'Ver semestres anteriores', exact: true });
  const next = page.getByRole('button', { name: 'Ver semestres siguientes', exact: true });
  const lastCourse = page.locator('[data-course-code="S10"]');
  for (const width of [1280, 1440, 1470]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await next.focus(); await next.press('Enter');
    await expect(next).toBeDisabled();
    await expect(lastCourse).toBeInViewport({ ratio: 1 });
    if (width === 1470) await page.screenshot({ path: testInfo.outputPath('malla-portatil-semestre-x.png'), animations: 'disabled' });
    await previous.focus(); await previous.press('Enter');
    await expect(previous).toBeDisabled();
    await expect(courses(page).first()).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const firstBounds = (await courses(page).first().boundingBox())!;
  const start = { x: firstBounds.x + firstBounds.width / 2, y: firstBounds.y + firstBounds.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x - 180, start.y, { steps: 12 });
  await expect(board).toHaveCSS('cursor', 'grabbing');
  await page.mouse.up();
  await expect(board).toHaveCSS('cursor', 'grab');
  await expect(next).toBeDisabled();
  await expect(lastCourse).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const secondBounds = (await page.locator('[data-course-code="B"]').boundingBox())!;
  await page.mouse.move(secondBounds.x + 20, secondBounds.y + 20); await page.mouse.down();
  await page.mouse.move(secondBounds.x + 200, secondBounds.y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(previous).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 3, start.y); await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Bases de nutrición', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(board).toHaveCSS('scroll-behavior', 'auto');
  await next.click(); await expect(next).toBeDisabled();
  await expect(lastCourse).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole('group', { name: 'Navegación de semestres' })).toHaveCount(0);
  await expect(courses(page).first()).toBeInViewport({ ratio: 1 });
  await expect(lastCourse).toBeInViewport({ ratio: 1 });
});

test('leyenda adaptable y detalle lateral conservan visibilidad, dirección y foco', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('transitionrun', event => {
      if (!(event instanceof TransitionEvent) || !(event.target instanceof HTMLDialogElement) || event.propertyName !== 'translate') return;
      const animation = event.target.getAnimations().find(item => item instanceof CSSTransition && item.transitionProperty === 'translate');
      const frames = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes();
      if (!frames || frames.length < 2) return;
      const transitions = JSON.parse(document.documentElement.dataset.detailTransitions ?? '[]');
      transitions.push({ side: event.target.className, from: frames[0]!.translate, to: frames[1]!.translate });
      document.documentElement.dataset.detailTransitions = JSON.stringify(transitions);
    }, true);
  });
  await page.setViewportSize({ width: 1470, height: 842 });
  await login(page);
  await chooseStudent(page, 'Estudiante Demo');
  const first = courses(page).first();
  for (const width of [1920, 1470, 1024]) {
    await page.setViewportSize({ width, height: width === 1470 ? 842 : 700 });
    await page.keyboard.press('Tab'); await first.focus();
    const legend = page.getByLabel('Relaciones resaltadas');
    await expect(legend).toBeVisible();
    const fits = await legend.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const content = document.querySelector('.academic-content')!.getBoundingClientRect();
      return bounds.left >= content.left && bounds.right <= content.right && bounds.bottom <= content.bottom && element.scrollWidth <= element.clientWidth;
    });
    expect(fits, `leyenda visible a ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1470, height: 842 });
  for (const [card, side] of [[first, 'right'], [courses(page).last(), 'left']] as const) {
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveClass(new RegExp(`academic-detail--${side}`));
    await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.detailTransitions ?? '')).toContain(`academic-detail--${side}`);
    await expect(dialog).toHaveCSS('translate', '0px');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(card).toBeFocused();
  }
  const transitions = await page.evaluate(() => JSON.parse(document.documentElement.dataset.detailTransitions ?? '[]') as { side: string; from: string; to: string }[]);
  for (const [side, direction] of [['right', 1], ['left', -1]] as const) {
    const enter = transitions.find(item => item.side.includes(`academic-detail--${side}`) && !item.side.includes('closing'));
    const exit = transitions.find(item => item.side.includes(`academic-detail--${side}`) && item.side.includes('closing'));
    expect(enter, `transición de entrada desde ${side}`).toBeDefined();
    expect(exit, `transición de salida hacia ${side}`).toBeDefined();
    expect(parseFloat(enter!.from) * direction).toBeGreaterThan(0);
    expect(parseFloat(enter!.to)).toBe(0);
    expect(parseFloat(exit!.to) * direction).toBeGreaterThan(0);
    for (const value of [enter!.from, enter!.to, exit!.from, exit!.to]) expect(parseFloat(value.split(' ')[1] ?? '0')).toBe(0);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await first.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('translate', 'none');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(first).toBeFocused();
});

test('el detalle espera las transiciones de salida antes de cerrarse', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('transitionrun', event => {
      if (!(event.target instanceof HTMLDialogElement) || !event.target.classList.contains('academic-detail--closing')) return;
      for (const animation of event.target.getAnimations()) animation.pause();
    }, true);
  });
  await login(page);
  const card = courses(page).first();
  await card.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('translate', '0px');
  await page.clock.install();
  await page.keyboard.press('Escape');
  await expect.poll(() => dialog.evaluate(element => element.getAnimations().some(animation => animation.playState === 'paused'))).toBe(true);
  await page.clock.runFor(250);
  await expect(dialog).toBeVisible();
  await dialog.evaluate(element => {
    for (const animation of element.getAnimations()) animation.finish();
  });
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('relaciones ficticias: respuesta inmediata, cadena visual, salida, teclado y detalle', async ({ page }, testInfo) => {
  let catalogReads = 0;
  await page.route('**/api/v1/academic/plans', route => route.fulfill({ json: { data: [{ planId: relationPlan.planId, name: relationPlan.name, versions: [{ version: relationPlan.version, isExample: true }] }] } }));
  await page.route(`**/api/v1/academic/plans/*/versions/${relationPlan.version}`, route => { catalogReads++; return route.fulfill({ json: { data: relationPlan } }); });
  await page.route('**/api/v1/academic/me/progress', route => route.fulfill({ json: { data: relationProgress } }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page, 'estudiante');
  const a = page.locator('[data-course-code="A"]'), b = page.locator('[data-course-code="B"]');
  await expect(a).toBeVisible();
  await expect(courses(page)).toHaveCount(50);
  await expect(page.locator('.academic-progress-badge')).toHaveCount(50);
  await expect(page.locator('.academic-semester__header h2')).toHaveText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
  await page.mouse.move(0, 0);
  const unrelated = page.locator('[data-course-code="X"]');
  const originalBackground = await unrelated.evaluate(element => getComputedStyle(element).backgroundImage);
  await page.clock.install(); await page.clock.pauseAt(Date.now() + 1000);
  // El reloj detenido comprueba que la activación no depende de una espera.
  await a.hover();
  await expect(a).toHaveAttribute('data-relation', 'origin');
  await expect(page.locator('[data-relation="direct"]')).toHaveCount(2);
  await expect(page.locator('[data-relation="indirect"]')).toHaveCount(8);
  await expect(page.locator('.academic-columns svg')).toHaveCount(0);
  await expect(unrelated).toHaveCSS('background-image', originalBackground);
  expect(await a.evaluate(element => getComputedStyle(element, '::before').transitionDuration)).toBe('0.15s');
  expect(await a.evaluate(element => getComputedStyle(element).transitionProperty)).toBe('none');
  await page.screenshot({ path: testInfo.outputPath('cadena-ficticia-1920.png'), animations: 'disabled' });
  expect(await a.evaluate(element => Number(getComputedStyle(element, '::before').opacity))).toBeGreaterThan(0);
  await expect(a).toHaveCSS('scale', 'none');
  await expect(a).toHaveCSS('translate', 'none');
  const highlightShadow = await a.evaluate(element => getComputedStyle(element, '::before').boxShadow);
  expect(highlightShadow).not.toBe('none');
  expect(await page.locator('[data-course-code="D"]').evaluate(element => ({ opacity: Number(getComputedStyle(element, '::after').opacity), border: getComputedStyle(element, '::after').borderStyle }))).toEqual({ opacity: .85, border: 'dashed' });
  expect(await unrelated.evaluate(element => getComputedStyle(element, '::before').opacity)).toBe('0');
  await expect(a.locator('.academic-course__origin-ring')).toHaveCSS('opacity', '1');
  await expect(a.locator('.academic-course__origin-ring')).toHaveCSS('border-style', 'solid');
  await expect(a.locator('.academic-course__origin-ring')).toHaveCSS('border-width', '2px');
  const directLayer = await b.evaluate(element => ({ border: getComputedStyle(element, '::before').borderStyle, width: getComputedStyle(element, '::before').borderWidth, fill: getComputedStyle(element, '::before').backgroundImage }));
  expect(directLayer.border).toBe('solid'); expect(parseFloat(directLayer.width)).toBeGreaterThanOrEqual(1); expect(parseFloat(directLayer.width)).toBeLessThan(2);
  expect(await b.evaluate(element => getComputedStyle(element, '::after').backgroundImage)).not.toBe(directLayer.fill);
  await expect(page.getByLabel('Relaciones resaltadas')).toHaveText('OrigenDirectaIndirecta');
  await expect(page.locator('.academic-toolbar__subtitle')).toHaveText(relationPlan.name);
  await expect(page.locator('.academic-toolbar .academic-tag')).toHaveText('Demostración');
  await b.hover(); await expect(b).toHaveAttribute('data-relation', 'origin');
  await expect(page.locator('[data-course-code="A"]')).not.toHaveAttribute('data-relation');
  expect(await a.evaluate(element => getComputedStyle(element, '::before').boxShadow)).toBe(highlightShadow);
  const bBox = (await b.boundingBox())!;
  await page.mouse.move(bBox.x + bBox.width / 2, bBox.y + bBox.height + 3);
  await expect(page.locator('[data-relation]')).toHaveCount(0);
  await expect(page.getByLabel('Relaciones resaltadas')).toHaveCount(0);
  await page.locator('[data-course-code="X"]').hover();
  await expect(unrelated).toHaveAttribute('data-relation', 'origin');
  await page.mouse.move(0, 0); await page.clock.fastForward(2000);
  await expect(page.locator('[data-relation]')).toHaveCount(0);
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(a).toHaveCSS('transition-property', 'none');
  await page.getByRole('region', { name: 'Asignaturas por semestre', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(a).toBeFocused(); await expect(a).toHaveAttribute('data-relation', 'origin');
  expect(await a.evaluate(element => ({ transform: getComputedStyle(element).transform, scale: getComputedStyle(element).scale, translate: getComputedStyle(element).translate, transition: getComputedStyle(element, '::before').transitionProperty }))).toEqual({ transform: 'none', scale: 'none', translate: 'none', transition: 'opacity' });
  await page.keyboard.press('Escape'); await expect(page.locator('[data-relation]')).toHaveCount(0);
  await a.click();
  const dialog = page.getByRole('dialog', { name: 'Bases de nutrición' });
  await expect(dialog).not.toContainText('Ejemplo ficticio');
  await expect(dialog).not.toContainText('Conexiones ficticias');
  await expect(dialog).toContainText('Más adelante en la cadena');
  await expect(dialog).toContainText('Práctica integrada');
  await expect(dialog).toContainText('A través de Evaluación nutricional');
  await page.keyboard.press('Escape'); await expect(a).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(catalogReads).toBe(1);
});

for (const role of ['docente', 'estudiante']) {
  test(`mockup de prerrequisitos ficticios: seis estados y teclado: ${role}`, async ({ page }, testInfo) => {
    await page.route('**/api/v1/academic/plans', route => route.fulfill({ json: { data: [{ planId: prerequisitePlan.planId, name: prerequisitePlan.name, versions: [{ version: prerequisitePlan.version, isExample: true }] }] } }));
    await page.route(`**/api/v1/academic/plans/*/versions/${prerequisitePlan.version}`, route => route.fulfill({ json: { data: prerequisitePlan } }));
    await login(page, role);
    await expect(page.locator('.academic-toolbar__subtitle')).toHaveText(prerequisitePlan.name);
    await expect(page.locator('.academic-toolbar .academic-tag')).toHaveText('Demostración');
    for (const width of [1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const example of prerequisiteCases) {
        const card = page.getByRole('button', { name: `Ver asignatura: ${example.name}`, exact: true });
        await card.focus(); await card.press('Enter');
        const dialog = page.getByRole('dialog', { name: example.name, exact: true });
        await expect(dialog).not.toContainText('Ejemplo ficticio para revisar la presentación.');
        await expect(dialog.getByRole('heading', { name: 'Prerrequisitos', exact: true })).toBeVisible();
        for (const text of example.text) await expect(dialog).toContainText(text);
        if (example.kind === 'pending' || example.kind === 'unsupported') await expect(dialog).not.toContainText('Sin prerrequisitos.');
        if (example.kind === 'allOf' || example.kind === 'anyOf') await expect(dialog.locator('.academic-rule > li')).toHaveCount(2);
        const close = dialog.getByRole('button', { name: 'Cerrar detalle', exact: true });
        await expect(close).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(dialog.locator('summary').last()).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(dialog.getByText(prerequisitePlan.version, { exact: true })).toHaveCount(0);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused();
        await expect(dialog).toHaveCSS('translate', '0px');
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const bounds = (await dialog.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`prerrequisito-${example.kind}-${width}.png`), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0); await expect(card).toBeFocused();
      }
    }
  });
}
for (const role of ['docente', 'estudiante']) {
  test(`catálogo PostgreSQL, recarga y trazabilidad de API: ${role}`, async ({ page }, testInfo) => {
    await login(page, role);
    await expect(courses(page)).toHaveCount(52);
    const internados = page.getByRole('region', { name: 'Semestres IX–X', exact: true });
    await expect(internados.locator('button')).toHaveCount(4);
    await expect(internados.getByRole('heading')).toHaveText('IX–X');
    const response = await page.request.get('/api/v1/academic/plans/nutricion-dietetica/versions/diagrama-r2');
    expect(response.status()).toBe(200);
    const data = (await response.json()).data;
    expect(data.courses).toHaveLength(52);
    expect(data.courses.filter((course: { semester: number }) => course.semester === 9).reduce((sum: number, course: { credits: number }) => sum + course.credits, 0)).toBe(65);
    expect(data.sources.map((source: { validationStatus: string }) => source.validationStatus)).toEqual(['teamReviewed', 'teamReviewed']);
    await page.getByRole('button', { name: 'Ver asignatura: Inocuidad alimentaria', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Inocuidad alimentaria', exact: true });
    await expect(detail.locator('#academic-rule-title + p')).toHaveText('Ciencia de los alimentos');
    await detail.locator('summary').filter({ hasText: 'Información del plan' }).click();
    const sources = detail.getByLabel('Fuentes del catálogo');
    for (const source of data.sources) await expect(sources).toContainText(source.title);
    await expect(sources.getByText('Revisada por el equipo. Validación institucional pendiente.', { exact: true })).toHaveCount(2);
    await expect(sources.locator('time')).toHaveText(['20/10/2026', '20/10/2026']);
    await expect(detail).not.toContainText('Validada institucionalmente.');
    await expect(page.getByLabel('Relaciones resaltadas')).toContainText('Relaciones de referencia');
    await expect(page.getByLabel('Relaciones resaltadas')).not.toContainText('Relaciones por confirmar');
    for (const width of [1440]) {
      await page.setViewportSize({ width, height: 900 });
      await sources.scrollIntoViewIfNeeded();
      await expect(sources).toBeVisible();
      expect(await detail.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await detail.screenshot({ path: testInfo.outputPath(`fuentes-${role}-${width}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
    await page.reload(); await expect(courses(page)).toHaveCount(52);
  });
}

test('detalle con teclado, relaciones pendientes y ausencia desconocida', async ({ page }) => {
  await login(page); await expect(courses(page)).toHaveCount(52);
  const card = page.getByRole('button', { name: 'Ver asignatura: Inocuidad alimentaria', exact: true });
  await card.focus(); await card.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Inocuidad alimentaria' });
  await expect(dialog.getByRole('heading', { name: 'En la malla', exact: true })).toBeVisible();
  await expect(dialog).toContainText('no son requisitos de inscripción');
  await expect(dialog).not.toContainText('En revisión');
  await expect(dialog).toContainText('Ciencia de los alimentos');
  await expect(dialog.locator('#academic-rule-title + p')).toHaveText('Ciencia de los alimentos');
  await expect(dialog.getByRole('button', { name: 'Cerrar detalle' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(card).toBeFocused();
  await expect(card).toHaveCSS('outline-color', 'rgb(83, 97, 118)');
  await expect(card).toHaveCSS('outline-style', 'solid');
  await expect(card).toHaveCSS('outline-offset', '-2px');
  await card.click();
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  await expect(card).toBeFocused();
  await expect(card).toHaveCSS('outline-style', 'none');
  await page.getByRole('button', { name: 'Ver asignatura: Form. general I (Formación general electiva I)', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Todavía no hay información de prerrequisitos para esta asignatura.');
  await expect(page.getByRole('dialog').getByText('Sin prerrequisitos.', { exact: true })).toHaveCount(0);
});

test('diagrama-r2 presenta los conjuntos aclarados sin sustituirlos por relaciones', async ({ page }) => {
  await login(page); await expect(courses(page)).toHaveCount(52);
  for (const [code, required] of [
    ['NUT2027-035', ['Dietética en el curso de vida', 'Modelo de intervención en salud']],
    ['NUT2027-044', ['Proyecto de innovación y emprendimiento en nutrición y salud', 'Gestión estratégica de sistemas de alimentación', 'Nutrición clínica materno infanto juvenil']],
    ['NUT2027-051', ['Proyecto de intervención comunitaria']],
  ] as const) {
    await page.locator(`[data-course-code="${code}"]`).click();
    const rule = page.getByRole('dialog').locator('section').filter({ has: page.getByRole('heading', { name: 'Prerrequisitos', exact: true }) });
    if (required.length > 1) await expect(rule).toContainText('Todos los siguientes:');
    for (const course of required) await expect(rule).toContainText(course);
    await expect(rule).not.toContainText('Pendientes de confirmación.');
    await page.getByRole('button', { name: 'Cerrar detalle' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

for (const role of ['estudiante', 'docente']) {
  test(`detalle y malla sin recuadros de foco al usar mouse: ${role}`, async ({ page }) => {
    await login(page, role); await expect(courses(page)).toHaveCount(52);
    const card = courses(page).first();
    const board = page.getByRole('region', { name: 'Asignaturas por semestre', exact: true });
    await card.click();
    await expect(page.getByRole('button', { name: 'Cerrar detalle' })).toHaveCSS('outline-style', 'none');
    await page.getByRole('button', { name: 'Cerrar detalle' }).click();
    await expect(card).toBeFocused();
    // Pasar por teclado reproduce el foco que puede conservar el diálogo.
    await card.focus(); await card.press('Enter'); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await card.click();
    const close = page.getByRole('button', { name: 'Cerrar detalle' });
    await expect(close).toHaveCSS('outline-style', 'none');
    await close.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await card.click();
    const backdrop = await page.locator('.academic-semester__header').first().boundingBox();
    await page.mouse.click(backdrop!.x + backdrop!.width / 2, backdrop!.y + backdrop!.height / 2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card).toBeFocused();
    await expect(card).toHaveCSS('outline-style', 'none');
    await page.mouse.click(backdrop!.x + backdrop!.width / 2, backdrop!.y + backdrop!.height / 2);
    // Safari puede mantener :focus-visible, pero el mouse no debe dibujar el borde.
    await expect(board).toHaveCSS('outline-style', 'none');
    await board.focus(); await page.keyboard.press('ArrowRight');
    await expect(board).toHaveCSS('outline-style', 'solid');
    await page.mouse.click(backdrop!.x + backdrop!.width / 2, backdrop!.y + backdrop!.height / 2);
    await expect(board).toHaveCSS('outline-style', 'none');
  });
}

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
  await expect(page.locator('.cenit-notice').getByRole('status')).toHaveText('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
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
  await expect(context).toContainText('20.123.456-5');
  const first = page.getByRole('button', { name: 'Ver asignatura: Cs. alimentos (Ciencia de los alimentos)', exact: true });
  await expect(first).toContainText('Aprobada');
  await expect(first).not.toContainText('5,2');
  await expect(first.locator('.academic-course__name')).toHaveText('Cs. alimentos');
  await expect(first).toHaveAccessibleDescription('Aprobada 7 SCT');
  await first.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Ciencia de los alimentos', exact: true })).toBeVisible();
  // The attempt history is shown directly, without a disclosure.
  await expect(dialog.getByRole('heading', { name: /^Historial de intentos/ })).toBeVisible();
  await expect(dialog.getByRole('row')).toHaveCount(3);
  await expect(dialog.getByRole('row').nth(1)).toContainText('Reprobada');
  await expect(dialog.getByRole('row').nth(1)).toContainText('3,2');
  await expect(dialog.getByRole('row').nth(2)).toContainText('5,2');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: testInfo.outputPath('historial-1440.png') });
  await page.keyboard.press('Escape');
  await page.reload(); await expect(first).toContainText('Aprobada');
  const own = await page.request.get('/api/v1/academic/me/progress'); expect(own.status()).toBe(200);
  const data = (await own.json()).data;
  expect((await page.request.get(`/api/v1/academic/students/${data.student.id}/progress`)).status()).toBe(403);
  expect((await page.request.get('/api/v1/academic/students')).status()).toBe(403);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await login(page);
  await chooseStudent(page, 'Estudiante Demo');
  await expect(context).toContainText('20.123.456-5');
  const teacher = await page.request.get(`/api/v1/academic/students/${data.student.id}/progress`);
  expect((await teacher.json()).data).toEqual(data);
});

test('docente busca tres perfiles por RUT/nombre y cambia de historial sin mezclar datos', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const results = page.locator('.academic-students__results');
  await expect(results).toBeVisible();
  await expect(results.getByRole('button')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('busqueda-docente-1440.png') });
  await page.getByLabel('RUT', { exact: true }).fill('211234563');
  await expect(results.getByRole('button')).toHaveCount(1);
  await results.getByRole('button', { name: /^Camila Demo/ }).click();
  await expect(page.getByRole('region', { name: 'Avance curricular', exact: true })).toContainText('Camila Demo');
  const board = page.getByRole('region', { name: 'Asignaturas por semestre', exact: true });
  await page.setViewportSize({ width: 1470, height: 842 });
  await expect.poll(() => board.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
  await expect(page.getByRole('group', { name: 'Navegación de semestres' })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => board.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
  await expect(page.getByRole('group', { name: 'Navegación de semestres' })).toHaveCount(0);
  const first = page.getByRole('button', { name: 'Ver asignatura: Cs. alimentos (Ciencia de los alimentos)', exact: true });
  await expectLatestGrade(page, '6,5');
  await page.getByRole('button', { name: 'Cambiar estudiante', exact: true }).click();
  await expect(page.locator('.academic-students__heading')).toContainText('Camila Demo');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#academic-students-search')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cambiar estudiante', exact: true })).toBeFocused();
  await expectLatestGrade(page, '6,5');
  await page.getByRole('button', { name: 'Cambiar estudiante', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Estudiante');
  await expect(page.getByRole('region', { name: 'Estudiantes de Nutrición' }).getByRole('status')).toContainText('No hay estudiantes que coincidan');
  await expect(first).not.toContainText('Aprobada');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(results.getByRole('button')).toHaveCount(3);
  await chooseStudent(page, 'Tomás Demo');
  await expectLatestGrade(page, '6');
  await chooseStudent(page, 'Estudiante Demo');
  await expect(first).toContainText('Aprobada');
  await expect(first).not.toContainText('5,2');
  await expect(first.locator('.academic-course__name')).toHaveText('Cs. alimentos');
  await expectLatestGrade(page, '5,2');
  await page.getByRole('button', { name: 'Ver asignatura: Fund. biológicos (Fundamentos biológicos para la nutrición)', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.academic-facts').first()).toContainText('2,5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ver asignatura: Inglés 1', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /^Historial de intentos/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Sin intentos registrados');
  await page.keyboard.press('Escape');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
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
  await expect(context.locator('.academic-student-identity')).toContainText('Camila Demo');
  release!();
  await expect(context.locator('.academic-student-identity')).not.toContainText('Tomás Demo');
  await expectLatestGrade(page, '6,5');
});

test('búsqueda automática por coincidencias y formato/verificación de RUT mientras se escribe', async ({ page }) => {
  await login(page);
  const results = page.locator('.academic-students__results');
  const name = page.getByLabel('Nombre', { exact: true });
  const rut = page.getByLabel('RUT', { exact: true });
  await expect(results.getByRole('button')).toHaveCount(3);
  await name.pressSequentially('cam');
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results).toContainText('Camila Demo');
  await name.fill('');
  await rut.pressSequentially('21');
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results).toContainText('Camila Demo');
  await rut.pressSequentially('1234563');
  await expect(rut).toHaveValue('21.123.456-3');
  await expect(results.getByRole('button')).toHaveCount(1);
  await rut.press('Backspace');
  await expect(rut).toHaveValue('21.123.456');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await rut.press('4');
  await expect(rut).toHaveValue('21.123.456-4');
  await expect(page.getByRole('alert')).toContainText('módulo 11');
  await expect(rut).toHaveAttribute('aria-invalid', 'true');
  await expect(results).toHaveCount(0);
  await rut.fill(' 21.123.456-3 ');
  await expect(rut).toHaveValue('21.123.456-3');
  await expect(results).toContainText('Camila Demo');
  await name.fill('Tomás');
  await expect(page.getByRole('region', { name: 'Estudiantes de Nutrición' }).getByRole('status')).toContainText('No hay estudiantes que coincidan');
  await rut.fill('');
  await expect(results).toContainText('Tomás Demo');
  await rut.fill('20000003k');
  await expect(rut).toHaveValue('20.000.003-K');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await rut.fill('20123456x');
  await expect(page.getByRole('alert')).toContainText('módulo 11');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(results.getByRole('button')).toHaveCount(3);
  await rut.fill('20.123.456-5');
  await rut.evaluate((input: HTMLInputElement) => input.setSelectionRange(1, 1));
  await rut.press('Delete');
  await expect(rut).toHaveValue('2.123.456-5');
  expect(await rut.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(1);
});

test('una respuesta de búsqueda tardía no reemplaza las coincidencias actuales', async ({ page }) => {
  await login(page);
  let release: (() => void) | undefined;
  await page.route('**/api/v1/academic/students?**', async route => {
    if (new URL(route.request().url()).searchParams.get('name') !== 'Camila') return route.continue();
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel('Nombre', { exact: true }).fill('Camila');
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel('Nombre', { exact: true }).fill('Tomás');
  const results = page.locator('.academic-students__results');
  await expect(results).toContainText('Tomás Demo');
  release!();
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results).not.toContainText('Camila Demo');
});

test('40 coincidencias se recorren en páginas de seis y un filtro nuevo vuelve a la primera', async ({ page }) => {
  await page.route('**/api/v1/academic/students?**', async route => {
    const search = new URL(route.request().url()).searchParams;
    expect(search.get('pageSize')).toBe('6');
    const current = Number(search.get('page'));
    const total = search.has('name') ? 1 : 40;
    const start = (current - 1) * 6;
    const data = Array.from({ length: Math.min(6, total - start) }, (_, index) => ({ id: `10000000-0000-4000-8000-${String(start + index + 1).padStart(12, '0')}`, name: `Estudiante de prueba ${start + index + 1}`, rut: '20.123.456-5' }));
    await route.fulfill({ json: { data, page: current, pageSize: 6, totalItems: total } });
  });
  await login(page);
  const students = page.getByRole('region', { name: 'Estudiantes de Nutrición' });
  const results = students.locator('.academic-students__results');
  await expect(results.getByRole('button')).toHaveCount(6);
  await expect(students.getByRole('status')).toContainText('40 estudiantes encontrados · Mostrando 1–6');
  await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
  await results.getByRole('button', { name: /^Estudiante de prueba 1 / }).click();
  await page.getByRole('button', { name: 'Cambiar estudiante', exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('.academic-students__pagination')).toContainText('Página 2 de 7');
  await expect(page.locator('.academic-students__heading')).toContainText('Estudiante de prueba 1');
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(page.locator('.academic-students__pagination')).toContainText('Página 1 de 7');
  await page.getByLabel('Nombre', { exact: true }).press('Enter');
  await expect(page.locator('.academic-students__heading')).toContainText('Estudiante de prueba 1');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cambiar estudiante', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cambiar estudiante', exact: true }).click();
  for (let current = 2; current <= 7; current++) {
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.locator('.academic-students__pagination')).toContainText(`Página ${current} de 7`);
  }
  await expect(results.getByRole('button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await page.getByLabel('Nombre', { exact: true }).fill('prueba');
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results).toContainText('Estudiante de prueba 1');
  await expect(page.locator('.academic-students__pagination')).toHaveCount(0);
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

test('malla compacta conserva contexto, espacio de lectura y navegación plegable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page);
  await expect(courses(page)).toHaveCount(52);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buscar estudiante', exact: true })).toHaveCount(0);
  await expect(page.getByText('Plan 2027', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Búsqueda automática por nombre o RUT.', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Prerrequisitos en revisión', { exact: true })).toHaveCount(0);
  expect((await page.getByLabel('Nombre', { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(36);
  await expect(page.locator('.academic-semester__header h2')).toHaveText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX–X']);
  await chooseStudent(page, 'Estudiante Demo');
  await expect(page.locator('.academic-progress-badge')).toHaveCount(52);
  await page.getByRole('heading', { name: 'Malla curricular', exact: true }).focus();
  await page.evaluate(() => { document.querySelector('.academic-content')!.scrollTop = 0; });
  await expect(courses(page).first()).toBeInViewport({ ratio: 1 });
  const completeRows = await page.evaluate(() => {
    const viewport = document.querySelector('.academic-content')!.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.academic-semester:first-child .academic-course')].map(element => element.getBoundingClientRect());
    return cards.filter(card => card.top >= viewport.top && card.bottom <= viewport.bottom).length;
  });
  expect(completeRows).toBeGreaterThanOrEqual(6);
  await page.getByRole('button', { name: 'Ocultar navegación', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Área académica' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar navegación', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Área académica' })).toBeVisible();
  await page.setViewportSize({ width: 1470, height: 900 });
  const allVisible = await courses(page).evaluateAll(elements => {
    const viewport = document.querySelector('.academic-content')!.getBoundingClientRect();
    return elements.every(element => { const card = element.getBoundingClientRect(); return card.top >= viewport.top && card.bottom <= viewport.bottom && card.left >= viewport.left && card.right <= viewport.right; });
  });
  expect(allVisible).toBe(true);
});

test('malla vigente sin selector y sin aplicar historiales de otra malla', async ({ page }) => {
  await page.route('**/api/v1/academic/plans', async route => {
    const response = await route.fetch(); const body = await response.json();
    body.data[0].versions.unshift({ version: 'otra-version-ejemplo', isExample: true });
    await route.fulfill({ json: body });
  });
  await page.route('**/api/v1/academic/me/progress', async route => {
    const response = await route.fetch(); const body = await response.json();
    body.data.plan.version = 'otra-version-ejemplo';
    await route.fulfill({ json: body });
  });
  await login(page, 'estudiante');
  await expect(courses(page)).toHaveCount(52);
  await expect(page.getByLabel('Versión del plan', { exact: true })).toHaveCount(0);
  await expect(page.getByText('El historial disponible corresponde a otra malla y no se muestra aquí.')).toHaveCount(0);
  await expect(page.locator('.academic-progress-badge')).toHaveCount(0);
});

test('no sustituye la malla vigente cuando no está publicada', async ({ page }) => {
  await page.route('**/api/v1/academic/plans', async route => {
    const response = await route.fetch(); const body = await response.json();
    body.data[0].versions = [{ version: 'otra-version-ejemplo', isExample: true }];
    await route.fulfill({ json: body });
  });
  await login(page, 'estudiante');
  await expect(page.getByRole('heading', { name: 'La malla todavía no está disponible' })).toBeVisible();
  await expect(courses(page)).toHaveCount(0);
});

test('malla y detalle legibles al redimensionar sin overflow del documento', async ({ page }, testInfo) => {
  await login(page); await expect(courses(page)).toHaveCount(52);
  await chooseStudent(page, 'Estudiante Demo');
  await expect(page.locator('.academic-progress-badge')).toHaveCount(52);
  const response = await page.request.get('/api/v1/academic/plans/nutricion-dietetica/versions/diagrama-r2');
  const names: string[] = (await response.json()).data.courses.map((course: { name: string }) => course.name);
  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 600 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `overflow a ${width}px`).toBe(true);
    const cards = await courses(page).evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      const label = element.querySelector('.academic-course__name')!;
      const name = label.getBoundingClientRect();
      const footer = element.querySelector('.academic-course__footer')!;
      const metadata = footer.getBoundingClientRect();
      const scale = Number.parseFloat(getComputedStyle(element).scale) || 1;
      return { width: bounds.width / scale, height: bounds.height / scale, nameFits: label.scrollHeight <= label.clientHeight + 1 && label.scrollWidth <= label.clientWidth && name.bottom <= metadata.top && name.right <= bounds.right, label: label.textContent!, accessibleName: element.getAttribute('aria-label')!, footerFits: footer.scrollWidth <= footer.clientWidth };
    }));
    expect(Math.max(...cards.map(card => card.width)) - Math.min(...cards.map(card => card.width)), `ancho uniforme a ${width}px`).toBeLessThan(1);
    expect(Math.max(...cards.map(card => card.height)) - Math.min(...cards.map(card => card.height)), `alto uniforme a ${width}px`).toBeLessThan(1);
    expect(cards.every(card => card.nameFits && card.accessibleName.includes(card.label) && names.some(name => card.accessibleName === `Ver asignatura: ${name}` || card.accessibleName.endsWith(` (${name})`))), `etiqueta breve legible y nombre completo accesible a ${width}px`).toBe(true);
    expect(new Set(cards.map(card => card.label)).size, 'etiquetas distintas para los 52 ramos').toBe(52);
    expect(cards.every(card => card.footerFits), `estado y SCT completos a ${width}px`).toBe(true);
    if ([1920, 1440].includes(width)) {
      const height = width === 1920 ? 1080 : 900;
      await page.setViewportSize({ width, height });
      await expect(page.locator('.workspace-shell')).toHaveCount(1);
      await expect.poll(() => page.locator('.workspace-shell').evaluate(element => Math.round(element.getBoundingClientRect().height))).toBe(height - 32);
      await page.evaluate(() => { document.querySelector('.academic-content')!.scrollTop = 0; document.querySelector('.academic-board')!.scrollLeft = 0; });
      await page.getByRole('heading', { name: 'Malla curricular', exact: true }).focus();
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.screenshot({ path: testInfo.outputPath(`malla-${width}.png`) });
      await page.setViewportSize({ width, height: 600 });
    }
    await page.getByRole('button', { name: 'Ver asignatura: Det. sociales y salud pública (Introducción a los determinantes sociales de la salud y salud pública)', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('translate', '0px');
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath('detalle-1440.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(courses(page)).toHaveCount(52);
  }
});
