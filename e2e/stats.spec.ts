import { expect, test } from '@playwright/test';
import { recordOrder, startEvent } from './helpers';

test('stats update without reload when an order is confirmed', async ({ page, context }) => {
  await startEvent(page, { float: '50' });
  const stats = await context.newPage();
  await stats.goto('/#/stats');
  await expect(stats.getByTestId('stat-revenue')).toHaveText('0,00 €');
  await expect(stats.getByTestId('stat-cash')).toHaveText('50,00 €');

  await recordOrder(page, 2, 1);
  await expect(stats.getByTestId('stat-revenue')).toHaveText('6,00 €');
  await expect(stats.getByTestId('stat-orders')).toHaveText('1');
  await expect(stats.getByTestId('stat-items')).toHaveText('3');
  await expect(stats.getByTestId('stat-cost')).toHaveText('2,40 €');
  await expect(stats.getByTestId('stat-margin')).toHaveText('3,60 €');
  await expect(stats.getByTestId('stat-cash')).toHaveText('56,00 €');
  await expect(stats.getByTestId('stat-last30')).toContainText('6,00 €');

  await recordOrder(page, 1);
  await expect(stats.getByTestId('stat-revenue')).toHaveText('8,50 €');
  await expect(stats.getByTestId('stat-average')).toHaveText('4,25 €');
});

test('per-product table sorts and groups by category', async ({ page }) => {
  await startEvent(page);
  await recordOrder(page, 1, 3); // Bière 2,50 ; Chips 3 × 1,00
  await page.goto('/#/stats');
  const names = () =>
    page.getByTestId('product-table').locator('tbody tr td:first-child').allTextContents();
  await expect.poll(names).toEqual(['Chips', 'Bière', 'Total']);
  await page.getByLabel('Trier par').selectOption('revenue');
  await expect.poll(names).toEqual(['Chips', 'Bière', 'Total']);
  await page.getByLabel('Trier par').selectOption('margin');
  await expect.poll(names).toEqual(['Chips', 'Bière', 'Total']);
  await page.getByTestId('group-by-category').check();
  await expect(page.getByTestId('subtotal-Boissons')).toContainText('2,50 €');
  await expect(page.getByTestId('subtotal-Nourriture')).toContainText('3,00 €');
});

test('home summary shows revenue and orders and opens stats; order screen links to stats', async ({
  page,
}) => {
  await startEvent(page);
  await recordOrder(page, 2, 1);
  await page.goto('/');
  await expect(page.getByTestId('home-revenue')).toHaveText('6,00 €');
  await expect(page.getByTestId('home-orders')).toHaveText('1');
  await page.getByTestId('home-stats').click();
  await expect(page.getByTestId('stat-revenue')).toHaveText('6,00 €');
  await page.goto('/#/order');
  await page.getByTestId('order-stats-link').click();
  await expect(page).toHaveURL(/#\/stats/);
});

test('activity chart shows the current slot', async ({ page }) => {
  await startEvent(page);
  await recordOrder(page, 1);
  await recordOrder(page, 1);
  await page.goto('/#/stats');
  const chart = page.getByTestId('slot-chart');
  await expect(chart.locator('path.bar')).toHaveCount(1);
  await expect(chart.locator('rect[data-orders="2"]')).toHaveCount(1);
});
