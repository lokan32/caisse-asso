import { expect, test } from 'vitest';
import { freshDb } from './testing';
import Dexie from 'dexie';
import { PosDb, catalogSyncKey } from './db';

test('records round-trip through every table', async () => {
  const d = await freshDb();
  await d.eventTypes.add({ id: 't1', name: 'Kermesse', createdAt: 1 });
  await d.categories.add({ id: 'c1', typeId: 't1', name: 'Boissons', position: 1 });
  await d.products.add({
    id: 'p1',
    categoryId: 'c1',
    name: 'Café',
    priceCents: 150,
    costCents: 30,
    color: '#795548',
    position: 1,
  });
  await d.events.add({
    id: 'e1',
    typeId: 't1',
    startDate: '2026-11-21',
    label: '',
    floatCents: 0,
    status: 'open',
    createdAt: 1,
    nextSeq: 1,
    revision: 0,
    syncedRevision: 0,
  });
  await d.orders.add({
    id: 'o1',
    eventId: 'e1',
    seq: 1,
    createdAt: 2,
    status: 'ok',
    lines: [],
    totalCents: 0,
    costCents: 0,
    revision: 1,
  });
  await d.settings.put({ key: 'currency', value: '€' });
  await d.syncState.put({ key: 'catalog', revision: 1, syncedRevision: 0 });

  expect((await d.products.get('p1'))?.name).toBe('Café');
  expect(await d.orders.where({ eventId: 'e1' }).count()).toBe(1);
  expect((await d.settings.get('currency'))?.value).toBe('€');
  expect(
    await d.products.where('[categoryId+position]').between(['c1', 0], ['c1', Infinity]).count(),
  ).toBe(1);
  expect(await d.syncState.get('catalog')).toMatchObject({ revision: 1 });
});

test('upgrading a v1 database moves everything into the "Général" type', async () => {
  const name = `upgrade-${Date.now()}`;
  const v1 = new Dexie(name);
  v1.version(1).stores({
    categories: 'id, position',
    products: 'id, categoryId, [categoryId+position]',
    events: 'id, status, startDate',
    orders: 'id, eventId, [eventId+seq], [eventId+revision]',
    settings: 'key',
    syncState: 'key',
  });
  await v1.open();
  await v1.table('categories').bulkAdd([
    { id: 'c1', name: 'Boissons', position: 1 },
    { id: 'c2', name: 'Nourriture', position: 2 },
  ]);
  await v1.table('products').bulkAdd(
    Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      categoryId: i < 6 ? 'c1' : 'c2',
      name: `P${i}`,
      priceCents: 100,
      costCents: 0,
      color: '#000000',
      position: (i % 6) + 1,
    })),
  );
  await v1.table('events').bulkAdd(
    ['e1', 'e2', 'e3'].map((id, i) => ({
      id,
      startDate: `2026-0${i + 1}-01`,
      label: '',
      floatCents: 0,
      status: 'closed',
      createdAt: i,
      nextSeq: 2,
      revision: 3,
      syncedRevision: 3,
    })),
  );
  await v1.table('orders').add({
    id: 'o1',
    eventId: 'e1',
    seq: 1,
    createdAt: 1,
    status: 'ok',
    lines: [],
    totalCents: 0,
    costCents: 0,
    revision: 1,
  });
  await v1
    .table('syncState')
    .put({ key: 'catalog', revision: 4, syncedRevision: 4, fileId: 'cfg' });
  v1.close();

  const d = new PosDb(name);
  await d.open();
  const types = await d.eventTypes.toArray();
  expect(types.map((t) => t.name)).toEqual(['Général']);
  const typeId = types[0].id;
  const cats = await d.categories
    .where('[typeId+position]')
    .between([typeId, -Infinity], [typeId, Infinity])
    .toArray();
  expect(cats.map((c) => c.name)).toEqual(['Boissons', 'Nourriture']);
  expect(await d.products.count()).toBe(12);
  expect((await d.events.toArray()).every((e) => e.typeId === typeId)).toBe(true);
  expect(await d.orders.count()).toBe(1);
  expect(await d.syncState.get('catalog')).toBeUndefined();
  expect(await d.syncState.get(catalogSyncKey(typeId))).toMatchObject({
    fileId: 'cfg',
    revision: 5,
    syncedRevision: 4,
  });
  d.close();
});
