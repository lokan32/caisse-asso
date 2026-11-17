import { beforeEach, describe, expect, test } from 'vitest';
import { freshDb } from '../db/testing';
import { FakeGoogle } from './testing/fake-google';
import { ConfigConflictError, GoogleApi } from './google-api';
import { adoptConfigFile, dirtyItems, importCatalog, syncCatalog, syncEvent } from './sync-ops';
import {
  addCategory,
  addProduct,
  deleteCategory,
  listCategories,
  listProducts,
} from '../db/catalog';
import { startEvent } from '../db/events';
import { editOrder, listOrders, recordOrder, voidOrder } from '../db/orders';
import { db } from '../db/db';
import { aggregate } from '../lib/aggregate';
import { buildEventSheets, parseConfigTabs, sanitizeTabTitle } from './sheets-layout';
import type { OrderLine } from '../db/types';

let fake: FakeGoogle;
let api: GoogleApi;

beforeEach(async () => {
  await freshDb();
  fake = new FakeGoogle();
  api = new GoogleApi(fake.token, fake.fetch);
});

const line = (
  productId: string,
  name: string,
  qty: number,
  price: number,
  cost: number,
  category = 'Boissons',
): OrderLine => ({
  productId,
  name,
  category,
  qty,
  unitPriceCents: price,
  unitCostCents: cost,
});
const beer = (q: number) => line('beer', 'Bière', q, 250, 100);
const chips = (q: number) => line('chips', 'Chips', q, 100, 40, 'Nourriture');
const coffee = (q: number) => line('coffee', 'Café', q, 150, 30);

describe('Drive files', () => {
  test('first sync creates the POS folder, pos-config and the event spreadsheet', async () => {
    await addCategory('Boissons');
    const e = await startEvent({ startDate: '2026-11-21' });
    await recordOrder(e.id, [beer(1)]);
    await syncCatalog(api);
    await syncEvent(api, e.id);
    const folder = fake.findByName('POS')!;
    expect(folder.mimeType).toBe('application/vnd.google-apps.folder');
    expect(fake.findByName('pos-config')!.parents).toEqual([folder.id]);
    const sheet = fake.findByName('event-2026-11-21')!;
    expect(sheet.parents).toEqual([folder.id]);
    expect(sheet.appProperties).toEqual({ posApp: 'event', eventId: e.id });
    expect(sheet.locale).toBe('fr_FR');
    expect(fake.sheetTitles('event-2026-11-21')).toEqual(['Commandes', 'Synthèse']);
  });

  test('an existing pos-config is never overwritten silently by a new device', async () => {
    fake.seedConfig([{ title: 'Old', rows: [['ID']] }]);
    await addCategory('Boissons');
    await expect(syncCatalog(api)).rejects.toBeInstanceOf(ConfigConflictError);
    expect(fake.sheetTitles('pos-config')).toEqual(['Old']);
  });

  test('after the user chooses to replace it, the existing pos-config is reused, not duplicated', async () => {
    const f = fake.seedConfig([{ title: 'Old', rows: [['ID']] }]);
    await addCategory('Boissons');
    await adoptConfigFile(f.id);
    await syncCatalog(api);
    const configs = [...fake.files.values()].filter((f) => f.name === 'pos-config');
    expect(configs).toHaveLength(1);
    expect(fake.sheetTitles('pos-config')).toEqual(['Boissons']);
  });

  test('second event on the same day gets the -2 suffix', async () => {
    const a = await startEvent({ startDate: '2026-11-21' });
    const b = await startEvent({ startDate: '2026-11-21' });
    await syncEvent(api, a.id);
    await syncEvent(api, b.id);
    expect(fake.findByName('event-2026-11-21')!.appProperties.eventId).toBe(a.id);
    expect(fake.findByName('event-2026-11-21-2')!.appProperties.eventId).toBe(b.id);
    expect((await db.events.get(b.id))?.spreadsheetName).toBe('event-2026-11-21-2');
  });

  test('a new device finds its event spreadsheet again by event id', async () => {
    const e = await startEvent({ startDate: '2026-11-21' });
    await syncEvent(api, e.id);
    await db.events.update(e.id, { spreadsheetId: undefined, spreadsheetName: undefined });
    await syncEvent(api, e.id);
    expect([...fake.files.values()].filter((f) => f.name.startsWith('event-'))).toHaveLength(1);
  });
});

describe('pos-config', () => {
  test('one tab per category with French headers and product rows', async () => {
    const drinks = await addCategory('Drinks');
    await addProduct({
      categoryId: drinks.id,
      name: 'Beer',
      priceCents: 250,
      costCents: 100,
      color: '#F4B400',
    });
    await addProduct({
      categoryId: drinks.id,
      name: 'Coffee',
      priceCents: 150,
      costCents: 30,
      color: '#795548',
    });
    await addCategory('Food/Snacks');
    await syncCatalog(api);
    expect(fake.sheetTitles('pos-config')).toEqual(['Drinks', 'Food Snacks']);
    const rows = fake.sheetValues('pos-config', 'Drinks');
    expect(rows[0]).toEqual(['ID', 'Nom', 'Prix de vente', "Prix d'achat", 'Couleur', 'Position']);
    expect(rows.slice(1).map((r) => r.slice(1))).toEqual([
      ['Beer', 2.5, 1, '#F4B400', 1],
      ['Coffee', 1.5, 0.3, '#795548', 2],
    ]);
    expect((await dirtyItems()).catalog).toBe(false);
  });

  test('deleted categories lose their tab', async () => {
    const a = await addCategory('A');
    await addCategory('B');
    await syncCatalog(api);
    await deleteCategory(a.id);
    expect((await dirtyItems()).catalog).toBe(true);
    await syncCatalog(api);
    expect(fake.sheetTitles('pos-config')).toEqual(['B']);
  });

  test('tab names are sanitised', () => {
    expect(sanitizeTabTitle('Boissons [chaudes]: café/thé?')).toBe('Boissons chaudes café thé');
  });

  test('import replaces the catalog and reports invalid rows', async () => {
    await addCategory('Local only');
    fake.seedConfig([
      {
        title: 'Boissons',
        rows: [
          ['ID', 'Nom', 'Prix de vente', "Prix d'achat", 'Couleur', 'Position'],
          ['p-beer', 'Bière', 2.5, 1, '#F4B400', 2],
          ['', 'Café', '1,50', '', 'pas une couleur', 1],
          ['p-bad', 'Soda', 'gratuit', 0.5, '#E53935', 3],
        ],
      },
      {
        title: 'Nourriture',
        rows: [
          ['ID', 'Nom'],
          ['p-chips', 'Chips', 1, 0.4, '#FDD835', 1],
        ],
      },
    ]);
    const result = await importCatalog(api);
    expect(result!.problems).toEqual([
      { sheet: 'Boissons', row: 4, reason: 'Prix de vente : Prix invalide' },
    ]);
    const cats = await listCategories();
    expect(cats.map((c) => c.name)).toEqual(['Boissons', 'Nourriture']);
    const drinks = await listProducts(cats[0].id);
    expect(drinks.map((p) => [p.name, p.priceCents, p.costCents, p.position])).toEqual([
      ['Café', 150, 0, 1],
      ['Bière', 250, 100, 2],
    ]);
    expect(drinks[1].id).toBe('p-beer');
    expect(drinks[0].color).toBe('#1E88E5');
    expect((await dirtyItems()).catalog).toBe(false);
  });

  test('import returns null when there is no pos-config', async () => {
    expect(await importCatalog(api)).toBeNull();
  });

  test('parse handles a missing id and duplicate ids', () => {
    let n = 0;
    const r = parseConfigTabs(
      [{ title: 'X', rows: [['h'], ['a', 'A', 1], ['a', 'B', 1]] }],
      () => `new-${++n}`,
    );
    expect(r.products.map((p) => p.id)).toEqual(['a', 'new-2']);
  });
});

describe('event spreadsheet', () => {
  test('Commandes rows and Synthèse equal aggregate()', async () => {
    const e = await startEvent({ startDate: '2026-11-21', label: 'Marché', floatCents: 5000 });
    await recordOrder(e.id, [beer(2), chips(1)], 1000);
    await recordOrder(e.id, [coffee(1)]);
    const o3 = await recordOrder(e.id, [beer(1)]);
    await voidOrder(o3.id);
    await syncEvent(api, e.id);

    const orders = fake.sheetValues('event-2026-11-21', 'Commandes');
    expect(orders[0]).toEqual([
      'N° commande',
      'Heure',
      'Statut',
      'Modifiée à',
      'Bière',
      'Chips',
      'Café',
      'Total',
      'Coût',
      'Montant reçu',
    ]);
    expect(orders.slice(1).map((r) => [r[0], r[2], r[4], r[5], r[6], r[7], r[8], r[9]])).toEqual([
      [1, 'OK', 2, 1, '', 6, 2.4, 10],
      [2, 'OK', '', '', 1, 1.5, 0.3, ''],
      [3, 'ANNULÉE', 1, '', '', 2.5, 1, ''],
    ]);

    const summary = fake.sheetValues('event-2026-11-21', 'Synthèse');
    const stats = aggregate(await listOrders(e.id), { floatCents: 5000 });
    expect(summary[0]).toEqual([
      'Catégorie',
      'Produit',
      'Quantité',
      "Chiffre d'affaires",
      'Coût',
      'Marge',
      'Marge %',
    ]);
    const productRows = summary.slice(1, 1 + stats.products.length);
    for (const p of stats.products) {
      const row = productRows.find((r) => r[1] === p.name)!;
      expect(row).toEqual([
        p.category,
        p.name,
        p.qty,
        p.revenueCents / 100,
        p.costCents / 100,
        p.marginCents / 100,
        Math.round(p.marginRate! * 10000) / 10000,
      ]);
    }
    const total = summary[1 + stats.products.length];
    expect(total.slice(0, 6)).toEqual([
      'Total',
      '',
      stats.itemsCount,
      7.5,
      stats.costCents / 100,
      stats.marginCents / 100,
    ]);
    const figure = (label: string) => summary.find((r) => r[0] === label)?.[1];
    expect(figure('Nombre de commandes')).toBe(2);
    expect(figure('Fond de caisse')).toBe(50);
    expect(figure('Caisse attendue')).toBe(57.5);
    expect(figure('Évènement')).toBe('Marché (21/11/2026)');
  });

  test('an edited order keeps a single row with status MODIFIÉE', async () => {
    const e = await startEvent({ startDate: '2026-11-21' });
    const o = await recordOrder(e.id, [beer(2)]);
    await syncEvent(api, e.id);
    await editOrder(o.id, [beer(1), coffee(1)]);
    await syncEvent(api, e.id);
    const rows = fake.sheetValues('event-2026-11-21', 'Commandes');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Café');
    expect(rows[1][2]).toBe('MODIFIÉE');
    expect(rows[1][3]).not.toBe('');
    expect(rows[1][rows[0].indexOf('Total')]).toBe(4);
  });

  test('writing twice yields identical content, and trailing rows are cleared', async () => {
    const e = await startEvent({ startDate: '2026-11-21' });
    for (let i = 0; i < 5; i++) await recordOrder(e.id, [beer(1)]);
    await syncEvent(api, e.id);
    const first = fake.sheetValues('event-2026-11-21', 'Commandes');
    await syncEvent(api, e.id);
    expect(fake.sheetValues('event-2026-11-21', 'Commandes')).toEqual(first);
    // Manual edit + extra junk row are overwritten by the next sync.
    fake.setCell('event-2026-11-21', 'Commandes', 20, 0, 'junk');
    fake.setCell('event-2026-11-21', 'Synthèse', 1, 2, 999);
    await syncEvent(api, e.id);
    expect(fake.sheetValues('event-2026-11-21', 'Commandes')).toEqual(first);
    expect(fake.sheetValues('event-2026-11-21', 'Synthèse')[1][2]).toBe(5);
  });

  test('sync marks the event as synced', async () => {
    const e = await startEvent({ startDate: '2026-11-21' });
    await recordOrder(e.id, [beer(1)]);
    expect((await dirtyItems()).events).toHaveLength(1);
    await syncEvent(api, e.id);
    expect((await dirtyItems()).events).toHaveLength(0);
  });

  test('layout builder handles two products with the same name', async () => {
    const e = await startEvent({ startDate: '2026-11-21' });
    const o = await recordOrder(e.id, [
      line('a1234567', 'Crêpe', 1, 200, 50),
      line('b7654321', 'Crêpe', 1, 300, 50),
    ]);
    const sheets = buildEventSheets((await db.events.get(e.id))!, [o], Date.now());
    expect(sheets.orders[0].slice(4, 6)).toEqual(['Crêpe (a123)', 'Crêpe (b765)']);
  });
});
