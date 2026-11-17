import { expect, test } from '@playwright/test';
import { createType, selectCategory, setChangeStep, setPrice, startEvent, tap } from './helpers';

test.beforeEach(async ({ page }) => {
  await startEvent(page);
  await page.goto('/#/order');
});

test('Bière x2 + Chips x1 = 6,00 €', async ({ page }) => {
  await tap(page, 'Bière', 2);
  await selectCategory(page, 'Nourriture');
  await tap(page, 'Chips');
  await expect(page.getByTestId('line-Bière')).toContainText('x2');
  await expect(page.getByTestId('line-Bière')).toContainText('5,00 €');
  await expect(page.getByTestId('line-Chips')).toContainText('1,00 €');
  await expect(page.getByTestId('order-total')).toHaveText('6,00 €');
  await selectCategory(page, 'Boissons');
  await expect(page.getByTestId('badge-Bière')).toHaveText('2');
});

test('decrease, remove a line and clear the order', async ({ page }) => {
  await tap(page, 'Bière', 2);
  await page.getByRole('button', { name: 'Retirer un Bière' }).click();
  await expect(page.getByTestId('line-Bière')).toContainText('x1');
  await expect(page.getByTestId('order-total')).toHaveText('2,50 €');
  await tap(page, 'Café');
  await page.getByRole('button', { name: 'Supprimer la ligne Café' }).click();
  await expect(page.getByTestId('line-Café')).toHaveCount(0);
  await page.getByTestId('clear-order').click();
  await expect(page.getByTestId('order-total')).toHaveText('0,00 €');
  await expect(page.getByTestId('checkout')).toBeDisabled();
});

test.describe('cash received and change', () => {
  test.beforeEach(async ({ page }) => {
    await tap(page, 'Bière', 2);
    await selectCategory(page, 'Nourriture');
    await tap(page, 'Chips');
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('cash-total')).toHaveText('6,00 €');
  });

  test('10 € received → 4,00 € change', async ({ page }) => {
    await page.getByTestId('quick-10').click();
    await expect(page.getByTestId('change')).toContainText('4,00 €');
    await page.getByTestId('cash-confirm').click();
    await expect(page.getByTestId('toast')).toHaveText('Commande n°1 enregistrée');
    await expect(page.getByTestId('order-total')).toHaveText('0,00 €');
  });

  test('5 € received is refused and shows what is missing', async ({ page }) => {
    await page.getByRole('button', { name: '5', exact: true }).click();
    await expect(page.getByTestId('missing')).toContainText('1,00 €');
    await expect(page.getByTestId('cash-confirm')).toBeDisabled();
  });

  test('keypad with decimals', async ({ page }) => {
    for (const k of ['6', ',', '5'])
      await page.getByRole('button', { name: k, exact: true }).click();
    await expect(page.getByTestId('cash-input')).toHaveValue('6,5');
    await expect(page.getByTestId('change')).toContainText('0,50 €');
  });
});

test('change step can be disabled', async ({ page }) => {
  await setChangeStep(page, false);
  await page.goto('/#/order');
  await tap(page, 'Bière');
  await page.getByTestId('checkout').click();
  await expect(page.getByTestId('cash-dialog')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveText('Commande n°1 enregistrée');
});

test('orders are recorded offline', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  for (let i = 1; i <= 3; i++) {
    await tap(page, 'Bière');
    await page.getByTestId('checkout').click();
    await page.getByRole('button', { name: 'Compte juste' }).click();
    await page.getByTestId('cash-confirm').click();
    await expect(page.getByTestId('toast')).toHaveText(`Commande n°${i} enregistrée`);
  }
  await context.setOffline(false);
});

test.describe('buttons depend on the event type', () => {
  test('type-only product and type-specific price', async ({ page }) => {
    await createType(page, 'Kermesse', 'Général');
    await setPrice(page, 'Kermesse', 'Café', '2');
    await page.getByRole('tab', { name: 'Nourriture' }).click();
    await page.getByTestId('add-product').click();
    await page.getByLabel('Nom', { exact: true }).fill('Barbe à papa');
    await page.getByLabel('Prix de vente').fill('3');
    await page.getByTestId('save-product').click();
    await expect(page.getByTestId('product-dialog')).toHaveCount(0);

    // Active event is of type "Général" (beforeEach).
    await page.goto('/#/order');
    await selectCategory(page, 'Nourriture');
    await expect(page.getByTestId('product-Barbe à papa')).toHaveCount(0);

    await startEvent(page, { type: 'Kermesse', switching: true });
    await page.goto('/#/order');
    await selectCategory(page, 'Nourriture');
    await expect(page.getByTestId('product-Barbe à papa')).toBeVisible();
    await selectCategory(page, 'Boissons');
    await tap(page, 'Café');
    await expect(page.getByTestId('order-total')).toHaveText('2,00 €');
  });
});
