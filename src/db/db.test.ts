import { expect, test } from 'vitest';
import { freshDb } from './testing';

test('records round-trip through every table', async () => {
  const d = await freshDb();
  await d.categories.add({ id: 'c1', name: 'Boissons', position: 1 });
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
