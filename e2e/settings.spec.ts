import { expect, test } from '@playwright/test';
import { recordOrder, startEvent } from './helpers';

test('changing the currency symbol updates prices and stats', async ({ page }) => {
  await startEvent(page);
  await recordOrder(page, 2, 1);
  await page.goto('/#/settings');
  await page.getByLabel('Symbole monétaire').fill('CHF');
  await page.goto('/#/order');
  await expect(page.getByTestId('product-Bière')).toContainText('2,50 CHF');
  await page.goto('/#/stats');
  await expect(page.getByTestId('stat-revenue')).toHaveText('6,00 CHF');
  await page.goto('/');
  await expect(page.getByTestId('home-revenue')).toHaveText('6,00 CHF');
});

test('settings show events, change step and Google account sections', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('events')).toBeVisible();
  await expect(page.getByTestId('change-step')).toBeChecked();
  await expect(page.getByTestId('account')).toContainText('Compte Google');
  await expect(page.getByTestId('connect-google')).toBeVisible();
});
