import { expect, test } from '@playwright/test';
import { recordOrder, selectCategory, startEvent, tap } from './helpers';

test.beforeEach(async ({ page }) => {
  await startEvent(page);
});

test('history lists orders newest first and opens one', async ({ page }) => {
  await recordOrder(page, 1);
  await recordOrder(page, 2, 1);
  await page.goto('/#/history');
  const items = page.getByTestId('history-list').locator('.list-item');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('n°2');
  await expect(items.first()).toContainText('6,00 €');
  await expect(items.first()).toContainText('3 articles');
  await expect(items.first()).toContainText('à synchroniser');
  await page.getByTestId('order-1').click();
  await expect(page.getByTestId('detail-total')).toHaveText('2,50 €');
  await expect(page.getByTestId('detail-received')).toHaveText('2,50 €');
  await expect(page.getByTestId('detail-change')).toHaveText('0,00 €');
});

test('voiding a 6,00 € order lowers live revenue by 6,00 €', async ({ page }) => {
  await recordOrder(page, 2, 1);
  await recordOrder(page, 1);
  await page.goto('/#/stats');
  await expect(page.getByTestId('stat-revenue')).toHaveText('8,50 €');
  await page.goto('/#/history');
  await page.getByTestId('order-1').click();
  await page.getByTestId('void-order').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('n°1');
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('order-detail')).toContainText('annulée');
  await expect(page.getByTestId('void-order')).toHaveCount(0);
  await expect(page.getByTestId('edit-order')).toHaveCount(0);
  await page.goto('/#/history');
  await expect(page.getByTestId('order-1')).toContainText('annulée');
  await page.goto('/#/stats');
  await expect(page.getByTestId('stat-revenue')).toHaveText('2,50 €');
  await expect(page.getByTestId('stat-orders')).toHaveText('1');
});

test('closed events offer no edit or void action', async ({ page }) => {
  await recordOrder(page, 1);
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Clôturer' }).click();
  await page.getByTestId('confirm-ok').click();
  await page.goto('/#/history');
  await page.getByTestId('order-1').click();
  await expect(page.getByTestId('order-detail')).toBeVisible();
  await expect(page.getByTestId('void-order')).toHaveCount(0);
  await expect(page.getByTestId('edit-order')).toHaveCount(0);
});

test.describe('editing an order', () => {
  async function openEdit(page: import('@playwright/test').Page, seq: number) {
    await page.goto('/#/history');
    await page.getByTestId(`order-${seq}`).click();
    await page.getByTestId('edit-order').click();
    await expect(page.getByTestId('edit-banner')).toHaveText(
      `Modification de la commande n°${seq}`,
    );
  }

  test('Bière x2 → Bière x1 + Café x1 = 4,00 €, 1,00 € given back', async ({ page }) => {
    await recordOrder(page, 2);
    await openEdit(page, 1);
    await expect(page.getByTestId('line-Bière')).toContainText('x2');
    await page.getByRole('button', { name: 'Retirer un Bière' }).click();
    await tap(page, 'Café');
    await expect(page.getByTestId('order-total')).toHaveText('4,00 €');
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('to-give-back')).toContainText('1,00 €');
    await page.getByTestId('adjust-confirm').click();

    await expect(page).toHaveURL(/#\/history\//);
    await expect(page.getByTestId('order-detail')).toContainText('modifiée');
    await expect(page.getByTestId('detail-total')).toHaveText('4,00 €');
    await expect(page.getByTestId('last-edit')).toContainText('Modifiée le');
    await expect(page.getByRole('heading')).toContainText('n°1');

    await page.goto('/#/history');
    await expect(page.getByTestId('history-list').locator('.list-item')).toHaveCount(1);
    await expect(page.getByTestId('order-1')).toContainText('modifiée');
  });

  test('customer owes more: 2,50 € to collect', async ({ page }) => {
    // Bière + Café = 4,00 €, paid with 5,00 €.
    await page.goto('/#/order');
    await tap(page, 'Bière');
    await tap(page, 'Café');
    await page.getByTestId('checkout').click();
    await page.getByTestId('quick-5').click();
    await page.getByTestId('cash-confirm').click();
    await expect(page.getByTestId('toast')).toBeVisible();

    await openEdit(page, 1);
    await tap(page, 'Bière');
    await expect(page.getByTestId('order-total')).toHaveText('6,50 €');
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('to-collect')).toContainText('2,50 €');
    await page.getByTestId('adjust-confirm').click();
    await expect(page.getByTestId('detail-received')).toHaveText('7,50 €');
    await expect(page.getByTestId('detail-change')).toHaveText('1,00 €');
  });

  test('live stats update after an edit', async ({ page }) => {
    await recordOrder(page, 2);
    await page.goto('/#/stats');
    await expect(page.getByTestId('stat-row-Bière').getByTestId('qty')).toHaveText('2');
    await openEdit(page, 1);
    await page.getByRole('button', { name: 'Retirer un Bière' }).click();
    await page.getByTestId('save-edit').click();
    await page.getByTestId('adjust-confirm').click();
    await expect(page.getByTestId('order-detail')).toContainText('modifiée');
    await page.goto('/#/stats');
    await expect(page.getByTestId('stat-row-Bière').getByTestId('qty')).toHaveText('1');
    await expect(page.getByTestId('stat-orders')).toHaveText('1');
    await expect(page.getByTestId('stat-revenue')).toHaveText('2,50 €');
  });

  test('emptying the order offers to void it instead', async ({ page }) => {
    await recordOrder(page, 1);
    await openEdit(page, 1);
    await page.getByRole('button', { name: 'Supprimer la ligne Bière' }).click();
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('ne peut pas être vide');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('order-detail')).toContainText('annulée');
  });

  test('cancel edit keeps the order unchanged', async ({ page }) => {
    await recordOrder(page, 1);
    await openEdit(page, 1);
    await selectCategory(page, 'Nourriture');
    await tap(page, 'Chips');
    await page.getByTestId('cancel-edit').click();
    await expect(page.getByTestId('detail-total')).toHaveText('2,50 €');
    await page.goto('/#/order');
    await expect(page.getByTestId('edit-banner')).toHaveCount(0);
  });
});
