import { expect, test } from '@playwright/test';
import { mockGoogle } from './google-mock';
import { createType, setChangeStep, startEvent, tap } from './helpers';

// Google requests are intercepted at page level; keep the service worker out of the way.
test.use({ serviceWorkers: 'block' });

async function connect(page: import('@playwright/test').Page) {
  await page.goto('/#/settings');
  await page.getByTestId('connect-google').click();
  await expect(page.getByTestId('account-email')).toHaveText('tresorier@example.org');
}

test('export screen without an account offers to connect', async ({ page, context }) => {
  await mockGoogle(context);
  await page.goto('/#/export');
  await expect(page.getByTestId('connect-google')).toBeEnabled();
  await expect(page.getByText('modifications faites à la main')).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('sync-indicator')).toContainText('Compte Google non connecté');
});

test('offline orders are synced when the connection returns', async ({ page, context }) => {
  const fake = await mockGoogle(context);
  await startEvent(page);
  await setChangeStep(page, false);
  await connect(page);

  await context.setOffline(true);
  await page.goto('/#/order');
  for (let i = 1; i <= 15; i++) {
    await tap(page, 'Bière');
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('toast')).toHaveText(`Commande n°${i} enregistrée`);
  }
  await page.getByTestId('back').click();
  await expect(page.getByTestId('pending-count')).toHaveText('15 commandes à synchroniser');
  expect(
    fake.findByName(`event-${new Date().toISOString().slice(0, 10)}`)?.sheets?.length ?? 0,
  ).toBeLessThanOrEqual(2);

  await context.setOffline(false);
  await expect(page.getByTestId('pending-count')).toHaveText('Tout est synchronisé', {
    timeout: 15_000,
  });
  const eventFile = [...fake.files.values()].find((f) => f.name.startsWith('event-'))!;
  const rows = fake.sheetValues(eventFile.name, 'Commandes');
  expect(rows).toHaveLength(16);
  expect(rows.slice(1).map((r) => r[0])).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  expect(fake.sheetValues(eventFile.name, 'Synthèse')[1].slice(1, 4)).toEqual(['Bière', 15, 37.5]);
  expect(fake.sheetTitles('pos-config-Général')).toEqual(['Boissons', 'Nourriture']);

  // Manual sync from the Export screen reports success and links to the spreadsheet.
  await page.goto('/#/export');
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-result')).toHaveText('Synchronisation réussie');
  await expect(page.getByTestId('event-sheet-link')).toHaveAttribute(
    'href',
    `https://docs.google.com/spreadsheets/d/${eventFile.id}/edit`,
  );
  await expect(page.getByTestId('export-pending')).toContainText('Tout est synchronisé');
});

test('sync error is reported with the number of pending items', async ({ page, context }) => {
  const fake = await mockGoogle(context);
  await startEvent(page);
  await setChangeStep(page, false);
  await connect(page);
  await expect(page.getByText('Compte Google connecté')).toHaveCount(0); // settings page
  await page.goto('/#/order');
  await tap(page, 'Bière');
  await page.getByTestId('checkout').click();
  fake.failNext = 100;
  await page.goto('/#/export');
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-result')).toContainText('Échec de la synchronisation');
  await expect(page.getByTestId('sync-result')).toContainText('élément(s) en attente');
  fake.failNext = 0;
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-result')).toHaveText('Synchronisation réussie');
});

test('import the catalog from pos-config', async ({ page, context }) => {
  const fake = await mockGoogle(context);
  fake.seedConfig([
    {
      title: 'Bar',
      rows: [
        ['ID', 'Nom', 'Prix de vente', "Prix d'achat", 'Couleur', 'Position'],
        ['x1', 'Cidre', 3, 1.2, '#7CB342', 1],
        ['x2', 'Vin chaud', 'abc', 1, '#C62828', 2],
      ],
    },
  ]);
  await connect(page);
  await page.goto('/#/export');
  // The example catalog of this new device did not overwrite pos-config.
  await expect(page.getByTestId('config-conflict')).toBeVisible();
  expect(fake.sheetTitles('pos-config')).toEqual(['Bar']);
  await page.getByTestId('import-catalog').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('import-result')).toContainText('1 produit(s) importé(s)');
  await expect(page.getByTestId('import-result')).toContainText('Bar, ligne 3');
  await expect(page.getByTestId('import-result')).toContainText('Types : Général');
  await page.goto('/#/edit');
  await expect(page.getByRole('tab', { name: 'Bar' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Boissons' })).toHaveCount(0);
  await expect(page.getByTestId('product-Cidre')).toContainText('3,00 €');
  await page.goto('/#/export');
  await expect(page.getByTestId('config-conflict')).toHaveCount(0);
});

test('replace an existing pos-config with this device catalog', async ({ page, context }) => {
  const fake = await mockGoogle(context);
  fake.seedConfig([
    {
      title: 'Bar',
      rows: [
        ['ID', 'Nom'],
        ['x1', 'Cidre', 3, 1, '#7CB342', 1],
      ],
    },
  ]);
  await connect(page);
  await page.goto('/#/export');
  await page.getByTestId('replace-remote').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('sync-result')).toHaveText('Synchronisation réussie');
  // The existing file is reused and renamed after the type, not duplicated.
  expect(fake.sheetTitles('pos-config-Général')).toEqual(['Boissons', 'Nourriture']);
  expect([...fake.files.values()].filter((f) => f.appProperties.posApp === 'config')).toHaveLength(
    1,
  );
});

test('one pos-config spreadsheet per event type, renamed with its type', async ({
  page,
  context,
}) => {
  const fake = await mockGoogle(context);
  await createType(page, 'Kermesse', 'Général');
  await connect(page);
  await page.goto('/#/export');
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-result')).toHaveText('Synchronisation réussie');
  const configNames = () =>
    [...fake.files.values()]
      .filter((f) => f.appProperties.posApp === 'config')
      .map((f) => f.name)
      .sort();
  expect(configNames()).toEqual(['pos-config-Général', 'pos-config-Kermesse']);
  await expect(page.getByTestId('config-link')).toHaveCount(2);

  await page.goto('/#/settings');
  await page
    .getByTestId('type-item')
    .filter({ hasText: 'Kermesse' })
    .getByTestId('rename-type')
    .click();
  await page.getByLabel('Nom du type').fill('Fête');
  await page.getByTestId('save-type').click();
  await page.goto('/#/export');
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-result')).toHaveText('Synchronisation réussie');
  expect(configNames()).toEqual(['pos-config-Fête', 'pos-config-Général']);
});
