import { expect, type Page } from '@playwright/test';

export async function startEvent(page: Page, opts: { label?: string; float?: string } = {}) {
  await page.goto('/#/settings');
  await page.getByTestId('start-event').click();
  if (opts.label) await page.getByLabel('Nom (facultatif)').fill(opts.label);
  if (opts.float) await page.getByLabel('Fond de caisse (facultatif)').fill(opts.float);
  await page.getByTestId('confirm-start-event').click();
  await expect(page.getByTestId('event-item').first()).toContainText('en cours');
}

export async function setChangeStep(page: Page, on: boolean) {
  await page.goto('/#/settings');
  const box = page.getByTestId('change-step');
  if ((await box.isChecked()) !== on) await box.click();
  await expect(box).toBeChecked({ checked: on });
}

export async function tap(page: Page, product: string, times = 1) {
  for (let i = 0; i < times; i++) await page.getByTestId(`product-${product}`).click();
}

export async function selectCategory(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

/** Record an order of Bière x beers (+ Chips x chips) paying the exact amount. */
export async function recordOrder(page: Page, beers: number, chips = 0) {
  await page.goto('/#/order');
  await selectCategory(page, 'Boissons');
  await tap(page, 'Bière', beers);
  if (chips) {
    await selectCategory(page, 'Nourriture');
    await tap(page, 'Chips', chips);
  }
  await page.getByTestId('checkout').click();
  if (await page.getByTestId('cash-dialog').isVisible()) {
    await page.getByRole('button', { name: 'Compte juste' }).click();
    await page.getByTestId('cash-confirm').click();
  }
  await expect(page.getByTestId('toast')).toContainText('enregistrée');
}

/** Normalise non-breaking spaces for text comparisons. */
export const euros = (s: string) => s.replace(/\s/g, '\u00a0');
