import { expect, test } from '@playwright/test';

test('home shows the five French entries', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  for (const label of [
    'Prendre une commande',
    'Modifier les boutons',
    'Historique des commandes',
    'Paramètres',
    'Exporter',
  ]) {
    await expect(page.getByRole('link', { name: label })).toBeVisible();
  }
});

test('every screen has a way back home', async ({ page }) => {
  for (const id of ['edit', 'history', 'settings', 'export']) {
    await page.goto('/');
    await page.getByTestId(`home-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`#/${id}`));
    await page.getByTestId('back').click();
    await expect(page.getByTestId('home-order')).toBeVisible();
  }
  for (const route of ['order', 'stats']) {
    await page.goto(`/#/${route}`);
    await page.getByTestId('back').click();
    await expect(page.getByTestId('home-order')).toBeVisible();
  }
});

test('app loads offline after first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled by the service worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Prendre une commande' })).toBeVisible();
  await context.setOffline(false);
});

test('manifest is French and installable', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.lang).toBe('fr');
  expect(m.display).toBe('standalone');
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});
