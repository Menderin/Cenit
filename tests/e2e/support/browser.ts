import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { DemoCredentials } from '../../../db/seeds/auth-demo.js';

export const credential = (role: string) => (JSON.parse(readFileSync('tmp/e2e-auth/credentials.json', 'utf8')) as DemoCredentials).find(c => c.role === role)!;

const santiagoDate = new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
export function santiagoToday() {
  const parts = Object.fromEntries(santiagoDate.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function login(page: Page, role = 'docente') {
  const account = credential(role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  return account;
}

export async function selectCalendarDate(page: Page, date: string, name = 'Calendario: Fecha', clicks = 1) {
  const calendar = page.getByRole('dialog', { name, exact: true });
  const middles = calendar.locator('.rdp-day[data-day$="-15"]');
  const target = date.slice(0, 7);
  for (let attempt = 0; attempt < 120; attempt++) {
    const shown = await middles.evaluateAll(days => days.map(day => day.getAttribute('data-day')!.slice(0, 7)));
    if (shown.includes(target)) {
      for (let click = 0; click < clicks; click++) await calendar.locator(`[data-day="${date}"] .rdp-day_button`).click();
      return;
    }
    await calendar.getByRole('button', { name: shown[0]! < target ? 'Ir al mes siguiente' : 'Ir al mes anterior' }).click();
    await expect(middles.first()).not.toHaveAttribute('data-day', `${shown[0]}-15`);
  }
  throw new Error(`No se pudo llegar a la fecha ${date} en el calendario.`);
}

/** En el filtro de fechas, un día exacto es el mismo día como inicio y fin del rango. */
export const selectRangeDay = (page: Page, date: string) => selectCalendarDate(page, date, 'Calendario de rango de fechas', 2);

export async function inspectSlowPanel(panel: Locator, screenshot: string) {
  await expect.poll(() => panel.evaluate(element => {
    const animations = element.getAnimations();
    for (const animation of animations) animation.updatePlaybackRate(.1);
    return animations.length;
  })).toBeGreaterThan(0);
  await panel.page().screenshot({ path: screenshot });
  await panel.evaluate(element => {
    for (const animation of element.getAnimations()) animation.updatePlaybackRate(1);
  });
}
