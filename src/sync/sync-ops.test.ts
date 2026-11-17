import { beforeEach, describe, expect, test } from 'vitest';
import { TEST_TYPE_ID, freshDb } from '../db/testing';
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
import { catalogSyncKey, db } from '../db/db';
import { createEventType, deleteEventType, renameEventType } from '../db/event-types';
import { aggregate } from '../lib/aggregate';
import { buildEventSheets, parseConfigTabs, sanitizeTabTitle } from './sheets-layout';
import type { OrderLine } from '../db/types';

const T = TEST_TYPE_ID;
const GENERAL = 'pos-config-Général';
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
    await addCategory(T, 'Boissons');
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await recordOrder(e.id, [beer(1)]);
    await syncCatalog(api, T);
    await syncEvent(api, e.id);
    const folder = fake.findByName('POS')!;
    expect(folder.mimeType).toBe('application/vnd.google-apps.folder');
    expect(fake.findByName(GENERAL)!.parents).toEqual([folder.id]);
    const sheet = fake.findByName('event-2026-11-21')!;
    expect(sheet.parents).toEqual([folder.id]);
    expect(sheet.appProperties).toEqual({ posApp: 'event', eventId: e.id });
    expect(sheet.locale).toBe('fr_FR');
    expect(fake.sheetTitles('event-2026-11-21')).toEqual(['Commandes', 'Synthèse']);
  });

  test('an existing pos-config is never overwritten silently by a new device', async () => {
    fake.seedConfig([{ title: 'Old', rows: [['ID']] }]);
    await addCategory(T, 'Boissons');
    await expect(syncCatalog(api, T)).rejects.toMatchObject({ typeId: T });
    await expect(syncCatalog(api, T)).rejects.toBeInstanceOf(ConfigConflictError);
    expect(fake.sheetTitles('pos-config')).toEqual(['Old']);
  });

  test('after the user chooses to replace it, the existing pos-config is reused, not duplicated', async () => {
    const f = fake.seedConfig([{ title: 'Old', rows: [['ID']] }]);
    await addCategory(T, 'Boissons');
    await adoptConfigFile(T, f.id);
    await syncCatalog(api, T);
    const configs = [...fake.files.values()].filter((f) => f.appProperties.posApp === 'config');
    expect(configs.map((c) => [c.id, c.name, c.appProperties.typeId])).toEqual([
      [f.id, GENERAL, T],
    ]);
    expect(fake.sheetTitles(GENERAL)).toEqual(['Boissons']);
  });

  test('second event on the same day gets the -2 suffix', async () => {
    const a = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    const b = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await syncEvent(api, a.id);
    await syncEvent(api, b.id);
    expect(fake.findByName('event-2026-11-21')!.appProperties.eventId).toBe(a.id);
    expect(fake.findByName('event-2026-11-21-2')!.appProperties.eventId).toBe(b.id);
    expect((await db.events.get(b.id))?.spreadsheetName).toBe('event-2026-11-21-2');
  });

  test('a new device finds its event spreadsheet again by event id', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await syncEvent(api, e.id);
    await db.events.update(e.id, { spreadsheetId: undefined, spreadsheetName: undefined });
    await syncEvent(api, e.id);
    expect([...fake.files.values()].filter((f) => f.name.startsWith('event-'))).toHaveLength(1);
  });
});

describe('pos-config-<type>', () => {
  test('one tab per category with French headers and product rows', async () => {
    const drinks = await addCategory(T, 'Drinks');
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
    await addCategory(T, 'Food/Snacks');
    await syncCatalog(api, T);
    expect(fake.sheetTitles(GENERAL)).toEqual(['Drinks', 'Food Snacks']);
    const rows = fake.sheetValues(GENERAL, 'Drinks');
    expect(rows[0]).toEqual(['ID', 'Nom', 'Prix de vente', "Prix d'achat", 'Couleur', 'Position']);
    expect(rows.slice(1).map((r) => r.slice(1))).toEqual([
      ['Beer', 2.5, 1, '#F4B400', 1],
      ['Coffee', 1.5, 0.3, '#795548', 2],
    ]);
    expect((await dirtyItems()).catalogTypes).toEqual([]);
  });

  test('deleted categories lose their tab', async () => {
    const a = await addCategory(T, 'A');
    await addCategory(T, 'B');
    await syncCatalog(api, T);
    await deleteCategory(a.id);
    expect((await dirtyItems()).catalogTypes).toEqual([T]);
    await syncCatalog(api, T);
    expect(fake.sheetTitles(GENERAL)).toEqual(['B']);
  });

  test('tab names are sanitised', () => {
    expect(sanitizeTabTitle('Boissons [chaudes]: café/thé?')).toBe('Boissons chaudes café thé');
  });

  test('import replaces the catalog and reports invalid rows', async () => {
    await addCategory(T, 'Local only');
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
      { sheet: 'pos-config › Boissons', row: 4, reason: 'Prix de vente : Prix invalide' },
    ]);
    const cats = await listCategories(T);
    expect(cats.map((c) => c.name)).toEqual(['Boissons', 'Nourriture']);
    const drinks = await listProducts(cats[0].id);
    expect(drinks.map((p) => [p.name, p.priceCents, p.costCents, p.position])).toEqual([
      ['Café', 150, 0, 1],
      ['Bière', 250, 100, 2],
    ]);
    expect(drinks[1].id).toBe('p-beer');
    expect(drinks[0].color).toBe('#1E88E5');
    expect(result).toMatchObject({ types: ['Général'], products: 3 });
    // The legacy file still has to be renamed after its type.
    expect((await dirtyItems()).catalogTypes).toEqual([T]);
  });

  test('import returns null when there is no pos-config', async () => {
    expect(await importCatalog(api)).toBeNull();
  });

  test('parse handles a missing id and duplicate ids', () => {
    let n = 0;
    const r = parseConfigTabs(
      [{ title: 'X', rows: [['h'], ['a', 'A', 1], ['a', 'B', 1]] }],
      () => `new-${++n}`,
      T,
    );
    expect(r.products.map((p) => p.id)).toEqual(['a', 'new-2']);
  });
});

describe('event spreadsheet', () => {
  test('Commandes rows and Synthèse equal aggregate()', async () => {
    const e = await startEvent({
      typeId: TEST_TYPE_ID,
      startDate: '2026-11-21',
      label: 'Marché',
      floatCents: 5000,
    });
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
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
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
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
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
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await recordOrder(e.id, [beer(1)]);
    expect((await dirtyItems()).events).toHaveLength(1);
    await syncEvent(api, e.id);
    expect((await dirtyItems()).events).toHaveLength(0);
  });

  test('layout builder handles two products with the same name', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    const o = await recordOrder(e.id, [
      line('a1234567', 'Crêpe', 1, 200, 50),
      line('b7654321', 'Crêpe', 1, 300, 50),
    ]);
    const sheets = buildEventSheets((await db.events.get(e.id))!, [o], Date.now());
    expect(sheets.orders[0].slice(4, 6)).toEqual(['Crêpe (a123)', 'Crêpe (b765)']);
  });
});

describe('one configuration spreadsheet per event type', () => {
  const configFiles = () =>
    [...fake.files.values()]
      .filter((f) => f.appProperties.posApp === 'config')
      .map((f) => f.name)
      .sort();

  test('first sync creates pos-config-<type> for each type', async () => {
    await addCategory(T, 'Boissons');
    const loto = await createEventType('Loto');
    await addCategory(loto.id, 'Cartons');
    const dirty = await dirtyItems();
    expect(dirty.catalogTypes.sort()).toEqual([T, loto.id].sort());
    for (const id of dirty.catalogTypes) await syncCatalog(api, id);
    expect(configFiles()).toEqual(['pos-config-Général', 'pos-config-Loto']);
    expect(fake.sheetTitles('pos-config-Loto')).toEqual(['Cartons']);
    expect(fake.findByName('pos-config-Loto')!.appProperties).toEqual({
      posApp: 'config',
      typeId: loto.id,
    });
    expect((await dirtyItems()).catalogTypes).toEqual([]);
  });

  test('renaming a type renames its spreadsheet without creating another one', async () => {
    const k = await createEventType('Kermesse');
    await syncCatalog(api, k.id);
    const id = fake.findByName('pos-config-Kermesse')!.id;
    await renameEventType(k.id, "Fête de l'école");
    expect((await dirtyItems()).catalogTypes).toEqual([k.id]);
    await syncCatalog(api, k.id);
    expect(configFiles()).toEqual(["pos-config-Fête de l'école"]);
    expect(fake.findByName("pos-config-Fête de l'école")!.id).toBe(id);
  });

  test('a deleted type leaves its spreadsheet untouched', async () => {
    const loto = await createEventType('Loto');
    await addCategory(loto.id, 'Cartons');
    await syncCatalog(api, loto.id);
    const before = fake.sheetValues('pos-config-Loto', 'Cartons');
    const requests = fake.requests.length;
    await deleteEventType(loto.id);
    expect((await dirtyItems()).catalogTypes).not.toContain(loto.id);
    expect(fake.requests.length).toBe(requests);
    expect(fake.sheetValues('pos-config-Loto', 'Cartons')).toEqual(before);
  });

  test('a migrated legacy pos-config is renamed pos-config-Général and tagged', async () => {
    const legacy = fake.seedConfig([{ title: 'Boissons', rows: [['ID']] }]);
    await addCategory(T, 'Boissons');
    // State as left by the database upgrade: file known, no synced name.
    await db.syncState.put({
      key: catalogSyncKey(T),
      revision: 5,
      syncedRevision: 4,
      fileId: legacy.id,
    });
    await syncCatalog(api, T);
    expect(configFiles()).toEqual(['pos-config-Général']);
    expect(fake.findByName(GENERAL)).toMatchObject({
      id: legacy.id,
      appProperties: { posApp: 'config', typeId: T },
    });
  });

  test('a spreadsheet with the same type name from another device is a conflict', async () => {
    fake.seedConfig([{ title: 'X', rows: [['ID']] }], { name: 'pos-config-Loto', typeId: 'other' });
    const loto = await createEventType('Loto');
    await expect(syncCatalog(api, loto.id)).rejects.toMatchObject({ typeId: loto.id });
    // Another type is not blocked.
    await syncCatalog(api, T);
    expect(configFiles()).toEqual(['pos-config-Général', 'pos-config-Loto']);
  });

  test('import on a new device creates the types and matches existing ones by name', async () => {
    const header = ['ID', 'Nom', 'Prix de vente', "Prix d'achat", 'Couleur', 'Position'];
    fake.seedConfig(
      [{ title: 'Boissons', rows: [header, ['k1', 'Café', 1.5, 0.3, '#795548', 1]] }],
      { name: 'pos-config-Kermesse', typeId: 'type-kermesse' },
    );
    fake.seedConfig([{ title: 'Boissons', rows: [header, ['g1', 'Café', 2, 0.3, '#795548', 1]] }], {
      name: 'pos-config-Général',
      typeId: 'type-of-other-device',
    });
    const local = await createEventType('Local');
    await addCategory(local.id, 'Gardée');

    const result = await importCatalog(api);
    expect(result).toEqual({ types: ['Général', 'Kermesse'], products: 2, problems: [] });
    const types = await db.eventTypes.toArray();
    expect(types.map((t) => [t.id, t.name]).sort()).toEqual(
      [
        [T, 'Général'],
        [local.id, 'Local'],
        ['type-kermesse', 'Kermesse'],
      ].sort(),
    );
    const price = async (typeId: string) =>
      (await listProducts((await listCategories(typeId))[0].id))[0].priceCents;
    expect(await price('type-kermesse')).toBe(150);
    expect(await price(T)).toBe(200);
    expect((await listCategories(local.id)).map((c) => c.name)).toEqual(['Gardée']);
    expect((await dirtyItems()).catalogTypes).toEqual([local.id]);
    // Syncing after import reuses the imported files.
    await syncCatalog(api, 'type-kermesse');
    expect(configFiles()).toEqual(['pos-config-Général', 'pos-config-Kermesse']);
  });
});
