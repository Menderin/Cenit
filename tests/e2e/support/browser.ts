import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { DemoCredentials } from '../../../db/seeds/auth-demo.js';

export const credential = (role: string) => (JSON.parse(readFileSync('tmp/e2e-auth/credentials.json', 'utf8')) as DemoCredentials).find(c => c.role === role)!;
export async function login(page: Page, role = 'docente') {
  const account = credential(role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  return account;
}
