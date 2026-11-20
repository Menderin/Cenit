import { expect, type Page } from '@playwright/test';
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

export async function selectCalendarDate(page: Page, date: string) {
  const calendar = page.getByRole('dialog', { name: 'Calendario: Fecha de envío', exact: true });
  const target = date.slice(0, 7);
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = (await calendar.locator('.rdp-day[data-day$="-15"]').getAttribute('data-day'))!.slice(0, 7);
    if (current === target) {
      await calendar.locator(`[data-day="${date}"] .rdp-day_button`).click();
      return;
    }
    await calendar.getByRole('button', { name: current < target ? 'Ir al mes siguiente' : 'Ir al mes anterior' }).click();
    await expect(calendar.locator('.rdp-day[data-day$="-15"]')).not.toHaveAttribute('data-day', `${current}-15`);
  }
  throw new Error(`No se pudo llegar a la fecha ${date} en el calendario.`);
}
