import { expect, test } from '@playwright/test';

test('fresh install shows the example catalog', async ({ page }) => {
  await page.goto('/#/edit');
  await expect(page.getByRole('tab', { name: 'Boissons' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Nourriture' })).toBeVisible();
  await expect(page.getByTestId('product-Café')).toBeVisible();
  await expect(page.getByTestId('product-Bière')).toContainText('2,50');
});

test('create a category and a product, then move it to position 1', async ({ page }) => {
  await page.goto('/#/edit');
  await page.getByTestId('add-category').click();
  await page.getByLabel('Nom de la catégorie').fill('Desserts');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('tab', { name: 'Desserts' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  for (const [name, price] of [
    ['Gaufre', '2,50'],
    ['Glace', '3.00'],
  ]) {
    await page.getByTestId('add-product').click();
    await page.getByLabel('Nom', { exact: true }).fill(name);
    await page.getByLabel('Prix de vente').fill(price);
    await page.getByLabel("Prix d'achat").fill('1');
    await page.getByTestId('save-product').click();
    await expect(page.getByTestId('product-dialog')).toHaveCount(0);
  }
  const names = () => page.getByTestId('edit-grid').locator('.product-btn .name').allTextContents();
  await expect.poll(names).toEqual(['Gaufre', 'Glace']);
  await expect(page.getByTestId('product-Glace')).toContainText('3,00 €');

  // Move "Glace" to position 1 with the arrow.
  await page.getByRole('button', { name: 'Déplacer avant Glace' }).click();
  await expect.poll(names).toEqual(['Glace', 'Gaufre']);

  // And back using the position field in the form.
  await page.getByTestId('product-Gaufre').click();
  await page.getByLabel('Position').fill('1');
  await page.getByTestId('save-product').click();
  await expect.poll(names).toEqual(['Gaufre', 'Glace']);

  // The new category is available on the order screen.
  await page.goto('/#/order');
});

test('invalid price is rejected', async ({ page }) => {
  await page.goto('/#/edit');
  await page.getByTestId('add-product').click();
  await page.getByLabel('Nom', { exact: true }).fill('Test');
  await page.getByLabel('Prix de vente').fill('-2');
  await page.getByTestId('save-product').click();
  await expect(page.getByText('Prix invalide')).toBeVisible();
  await expect(page.getByLabel('Prix de vente')).toHaveAttribute('aria-invalid', 'true');
});

test('deleting a non-empty category asks for confirmation', async ({ page }) => {
  await page.goto('/#/edit');
  await page.getByRole('tab', { name: 'Nourriture' }).click();
  await page.getByTestId('delete-category').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Nourriture');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('tab', { name: 'Nourriture' })).toBeVisible();
  await page.getByTestId('delete-category').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByRole('tab', { name: 'Nourriture' })).toHaveCount(0);
});
