import { expect, test } from '@playwright/test';
import { createType, startEvent } from './helpers';

test('fresh install has the "Général" type', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('type-name')).toHaveText(['Général']);
  // The last type cannot be deleted.
  await expect(page.getByTestId('delete-type')).toHaveCount(0);
});

test('create a type from an existing configuration', async ({ page }) => {
  await createType(page, 'Kermesse', 'Général');
  await page.goto('/#/edit');
  await page.getByTestId('edit-type').selectOption({ label: 'Kermesse' });
  await expect(page.getByRole('tab', { name: 'Boissons' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Nourriture' })).toBeVisible();
  await expect(page.getByTestId('product-Bière')).toContainText('2,50');

  await createType(page, 'Loto');
  await page.goto('/#/edit');
  await page.getByTestId('edit-type').selectOption({ label: 'Loto' });
  await expect(page.getByRole('tab', { name: 'Boissons' })).toHaveCount(0);
});

test('duplicate type names are rejected', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('create-type').click();
  await page.getByLabel('Nom du type').fill('général');
  await page.getByTestId('save-type').click();
  await expect(page.getByTestId('type-dialog')).toContainText('Ce nom est déjà utilisé');
});

test('rename a type, refuse deleting it while an open event uses it', async ({ page }) => {
  await createType(page, 'Kermesse', 'Général');
  await startEvent(page, { type: 'Kermesse', label: 'Kermesse 2026' });
  const event = page.getByTestId('event-item').filter({ hasText: 'Kermesse 2026' });
  await expect(event.getByTestId('event-type')).toHaveText('Kermesse');

  const kermesse = page.getByTestId('type-item').filter({ hasText: 'Kermesse' });
  await kermesse.getByTestId('rename-type').click();
  await page.getByLabel('Nom du type').fill("Kermesse de l'école");
  await page.getByTestId('save-type').click();
  await expect(event.getByTestId('event-type')).toHaveText("Kermesse de l'école");

  await page
    .getByTestId('type-item')
    .filter({ hasText: "Kermesse de l'école" })
    .getByTestId('delete-type')
    .click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('toast')).toContainText('un évènement ouvert utilise ce type');
  await expect(page.getByTestId('type-item')).toHaveCount(2);

  // "Général" is not used by an open event: it can be deleted, then the last type stays.
  await page
    .getByTestId('type-item')
    .filter({ hasText: 'Général' })
    .getByTestId('delete-type')
    .click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('type-name')).toHaveText(["Kermesse de l'école"]);
  await expect(page.getByTestId('delete-type')).toHaveCount(0);

  // Home shows the active event's type.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('active-event-type')).toHaveText(
    "Type d'évènement : Kermesse de l'école",
  );
});
