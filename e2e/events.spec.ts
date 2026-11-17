import { expect, test } from '@playwright/test';

test('take order without an event asks to start one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('active-event')).toHaveText('Aucun évènement en cours');
  await page.getByTestId('home-order').click();
  await expect(page.getByTestId('no-event')).toBeVisible();
  await page.getByRole('link', { name: 'Démarrer un évènement' }).click();
  await expect(page).toHaveURL(/#\/settings/);
});

test('start an event and see its name on home', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('start-event').click();
  await expect(page.getByLabel("Type d'évènement")).toHaveValue(/.+/);
  await page.getByLabel('Date de début').fill('2026-11-21');
  await page.getByLabel('Nom (facultatif)').fill('Marché de Noël');
  await page.getByLabel('Fond de caisse (facultatif)').fill('50');
  await page.getByTestId('confirm-start-event').click();
  await expect(page.getByTestId('event-item')).toContainText('Marché de Noël (21/11/2026)');
  await expect(page.getByTestId('event-item')).toContainText('en cours');
  await expect(page.getByTestId('event-type')).toHaveText('Général');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('active-event')).toHaveText(
    'Évènement en cours : Marché de Noël (21/11/2026)',
  );
  await expect(page.getByTestId('active-event-type')).toHaveText("Type d'évènement : Général");
  await page.getByTestId('home-order').click();
  await expect(page.getByTestId('no-event')).toHaveCount(0);
});

test('close an event after confirmation', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('start-event').click();
  await page.getByTestId('confirm-start-event').click();
  await page.getByRole('button', { name: 'Clôturer' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('event-item')).toContainText('clôturé');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('active-event')).toHaveText('Aucun évènement en cours');
});
