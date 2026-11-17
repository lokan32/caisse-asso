import { expect, type Page } from '@playwright/test';

/** Start an event of the given type (default: the preselected type, "Général" on a fresh install). */
export async function startEvent(
  page: Page,
  opts: { label?: string; float?: string; type?: string; switching?: boolean } = {},
) {
  await page.goto('/#/settings');
  await page.getByTestId('start-event').click();
  const typeSelect = page.getByLabel("Type d'évènement");
  if (opts.type) await typeSelect.selectOption({ label: opts.type });
  else await expect(typeSelect).not.toHaveValue('');
  if (opts.label) await page.getByLabel('Nom (facultatif)').fill(opts.label);
  if (opts.float) await page.getByLabel('Fond de caisse (facultatif)').fill(opts.float);
  await page.getByTestId('confirm-start-event').click();
  // Another event is active: confirm the switch.
  if (opts.switching) await page.getByTestId('confirm-ok').click();
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

/** Create an event type from Settings, empty or copied from `from`. */
export async function createType(page: Page, name: string, from?: string) {
  await page.goto('/#/settings');
  await page.getByTestId('create-type').click();
  await page.getByLabel('Nom du type').fill(name);
  if (from)
    await page.getByLabel('Partir de').selectOption({ label: `Configuration de « ${from} »` });
  await page.getByTestId('save-type').click();
  await expect(page.getByTestId('type-dialog')).toHaveCount(0);
  await expect(page.getByTestId('type-item').filter({ hasText: name })).toBeVisible();
}

/** Change the sale price of a product of an event type from "Modifier les boutons". */
export async function setPrice(page: Page, type: string, product: string, price: string) {
  await page.goto('/#/edit');
  await page.getByTestId('edit-type').selectOption({ label: type });
  await page.getByTestId(`product-${product}`).click();
  await page.getByLabel('Prix de vente').fill(price);
  await page.getByTestId('save-product').click();
  await expect(page.getByTestId('product-dialog')).toHaveCount(0);
}
