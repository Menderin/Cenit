import { expect, test } from '@playwright/test';
import { login } from './support/browser.js';

test('Bienes: registrar, encontrar, prestar y confirmar la devolución', async ({ page }) => {
  await login(page, 'administrativo');
  const suffix = crypto.randomUUID().slice(0, 8);
  const description = `Proyector ficticio ${suffix}`, borrower = `Persona ficticia ${suffix}`;
  const inventory = page.getByRole('navigation', { name: 'Sistemas administrativos' }).getByRole('link', { name: 'Bienes', exact: true });
  await inventory.click();
  await page.locator('.assets-heading').getByRole('link', { name: 'Registrar bien', exact: true }).click();
  await page.getByLabel('Descripción', { exact: true }).fill(description);
  await page.getByRole('combobox', { name: 'Ubicación', exact: true }).fill('Laboratorio ficticio');
  await page.getByRole('button', { name: 'Registrar bien', exact: true }).click();
  const heading = page.getByRole('heading', { name: description, exact: true });
  await expect(heading).toBeVisible();
  const assetPath = new URL(page.url()).pathname;
  const asset = page.getByRole('row').filter({ hasText: description });
  const status = asset.locator('.assets-chip');

  await page.getByRole('link', { name: 'Volver a Bienes', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar bienes', exact: true }).fill(description);
  await expect(status).toHaveText('Sin responsable');
  await asset.getByRole('link', { name: /^BN-\d+$/ }).click();
  await expect(page).toHaveURL(new RegExp(`${assetPath}$`));
  await page.getByRole('link', { name: 'Prestar', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: description })).toBeVisible();
  await page.getByRole('combobox', { name: 'Persona que recibe el préstamo', exact: true }).fill(borrower);
  await page.getByRole('option', { name: `Agregar «${borrower}» como persona nueva`, exact: true }).click();
  await page.getByRole('group', { name: 'Persona nueva' }).getByRole('button', { name: 'Agregar persona', exact: true }).click();
  await expect(page.locator('.assets-picked').getByText(borrower, { exact: true })).toBeVisible();
  await page.getByLabel('Nombre de quien autoriza', { exact: true }).fill('Autorización ficticia');
  await page.getByRole('button', { name: 'Guardar préstamo', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Préstamo N° \d+\/\d{4}$/ })).toBeVisible();
  await expect(page.getByText(borrower, { exact: true })).toBeVisible();

  await inventory.click();
  await page.getByRole('searchbox', { name: 'Buscar bienes', exact: true }).fill(description);
  await expect(status).toHaveText('En préstamo');
  await asset.getByRole('link', { name: /^BN-\d+$/ }).click();
  await page.getByRole('button', { name: 'Registrar devolución', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: /^Registrar devolución del préstamo/ });
  await confirm.getByRole('button', { name: 'Registrar', exact: true }).click();
  const history = page.getByRole('region', { name: 'Historial del bien', exact: true });
  await expect(history.getByText(`Devuelto por ${borrower}`, { exact: true })).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(history.getByText(`Devuelto por ${borrower}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prestar', exact: true })).toBeVisible();

  await inventory.click();
  await page.getByRole('searchbox', { name: 'Buscar bienes', exact: true }).fill(description);
  await expect(status).toHaveText('Sin responsable');
});
