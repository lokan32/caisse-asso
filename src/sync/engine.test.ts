import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TEST_TYPE_ID, freshDb } from '../db/testing';
import { FakeGoogle } from './testing/fake-google';
import { AuthError, GoogleApi } from './google-api';
import { createSyncEngine, type EngineDeps } from './engine';
import { dirtyItems, syncCatalog, syncEvent } from './sync-ops';
import { startEvent } from '../db/events';
import { pendingOrdersCount, recordOrder } from '../db/orders';
import { db } from '../db/db';
import { addCategory, markCatalogDirty } from '../db/catalog';
import { createEventType } from '../db/event-types';
import type { OrderLine } from '../db/types';

const beer: OrderLine = {
  productId: 'beer',
  name: 'Bière',
  category: 'Boissons',
  qty: 1,
  unitPriceCents: 250,
  unitCostCents: 100,
};

let fake: FakeGoogle;
let online: boolean;
let timers: { fn: () => void; ms: number }[];

function engine(overrides: Partial<EngineDeps> = {}) {
  return createSyncEngine({
    getApi: async () => new GoogleApi(fake.token, fake.fetch),
    isOnline: () => online,
    dirty: dirtyItems,
    syncCatalog,
    syncEvent,
    activeEventId: async () => null,
    onAuthError: async () => {},
    setTimeout: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return t;
    },
    clearTimeout: (h) => {
      timers = timers.filter((t) => t !== h);
    },
    ...overrides,
  });
}

beforeEach(async () => {
  await freshDb();
  fake = new FakeGoogle();
  online = true;
  timers = [];
});

const commandesRows = () => fake.sheetValues('event-2026-11-21', 'Commandes').slice(1);

describe('sync engine', () => {
  test('offline: nothing is sent, orders stay pending; back online: all synced', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    for (let i = 0; i < 15; i++) await recordOrder(e.id, [beer]);
    online = false;
    const s = engine();
    expect((await s.syncNow()).status).toBe('offline');
    expect(fake.requests).toHaveLength(0);
    online = true;
    expect((await s.syncNow()).ok).toBe(true);
    expect(commandesRows()).toHaveLength(15);
    expect(await pendingOrdersCount((await db.events.get(e.id))!)).toBe(0);
  });

  test('a revision change during upload keeps the event dirty and schedules another pass', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await recordOrder(e.id, [beer]);
    const s = engine({
      syncEvent: async (api, id) => {
        const r = await syncEvent(api, id);
        return r;
      },
    });
    // Record an order while the upload is in flight.
    const original = fake.fetch;
    let injected = false;
    fake.fetch = async (input, init) => {
      if (!injected && String(input).includes('values:batchUpdate')) {
        injected = true;
        await recordOrder(e.id, [beer]);
      }
      return original(input, init);
    };
    await s.syncNow();
    const ev = (await db.events.get(e.id))!;
    expect(ev.syncedRevision).toBeLessThan(ev.revision);
    expect(await pendingOrdersCount(ev)).toBe(1);
    expect(timers).toHaveLength(1);
    // The scheduled pass picks it up.
    fake.fetch = original;
    timers[0].fn();
    await vi.waitFor(async () =>
      expect(await pendingOrdersCount((await db.events.get(e.id))!)).toBe(0),
    );
    expect(commandesRows()).toHaveLength(2);
  });

  test('retry after a failure in the middle of a sync: no duplicates, nothing lost', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    for (let i = 0; i < 10; i++) await recordOrder(e.id, [beer]);
    const s = engine();
    // Let the spreadsheet be created, then fail during the write.
    const original = fake.fetch;
    fake.fetch = async (input, init) => {
      if (String(input).includes('values:batchUpdate')) fake.failNext = 1;
      return original(input, init);
    };
    const r1 = await s.syncNow();
    expect(r1.status).toBe('error');
    expect(timers.at(-1)!.ms).toBe(10_000); // backoff
    fake.fetch = original;
    expect((await s.syncNow()).ok).toBe(true);
    expect(commandesRows().map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...fake.files.values()].filter((f) => f.name.startsWith('event-'))).toHaveLength(1);
  });

  test('auth errors ask the user to reconnect and keep data', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await recordOrder(e.id, [beer]);
    const onAuthError = vi.fn(async () => {});
    const s = engine({ getApi: async () => new GoogleApi('expired', fake.fetch), onAuthError });
    const r = await s.syncNow();
    expect(r.status).toBe('needs-auth');
    expect(onAuthError).toHaveBeenCalled();
    expect(await pendingOrdersCount((await db.events.get(e.id))!)).toBe(1);
    const s2 = engine({ getApi: async () => Promise.reject(new AuthError()) });
    expect((await s2.syncNow()).status).toBe('needs-auth');
  });

  test('an existing pos-config raises a conflict but events still sync', async () => {
    const f = fake.seedConfig([{ title: 'Autre appareil', rows: [['ID']] }]);
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await recordOrder(e.id, [beer]);
    await markCatalogDirty(TEST_TYPE_ID);
    const s = engine();
    expect((await s.syncNow()).ok).toBe(true);
    expect(s.getState().configConflicts).toEqual([{ typeId: TEST_TYPE_ID, fileId: f.id }]);
    expect(commandesRows()).toHaveLength(1);
    expect(fake.sheetTitles('pos-config')).toEqual(['Autre appareil']);
    expect(timers).toHaveLength(0);
  });

  test('a conflict on one type does not block the other types', async () => {
    fake.seedConfig([{ title: 'Autre appareil', rows: [['ID']] }]);
    const loto = await createEventType('Loto');
    await addCategory(loto.id, 'Cartons');
    await markCatalogDirty(TEST_TYPE_ID);
    const s = engine();
    expect((await s.syncNow()).ok).toBe(true);
    expect(s.getState().configConflicts.map((c) => c.typeId)).toEqual([TEST_TYPE_ID]);
    expect(fake.sheetTitles('pos-config-Loto')).toEqual(['Cartons']);
    expect(await dirtyItems()).toMatchObject({ catalogTypes: [TEST_TYPE_ID] });
    s.clearConflict(TEST_TYPE_ID);
    expect(s.getState().configConflicts).toEqual([]);
  });

  test('no account connected: nothing happens', async () => {
    const s = engine({ getApi: async () => null });
    expect((await s.syncNow()).status).toBe('disconnected');
  });

  test('changes are debounced; concurrent requests share one pass', async () => {
    const e = await startEvent({ typeId: TEST_TYPE_ID, startDate: '2026-11-21' });
    await recordOrder(e.id, [beer]);
    const s = engine();
    s.notifyChange();
    s.notifyChange();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(5000);
    const [a, b] = await Promise.all([s.syncNow(), s.syncNow()]);
    expect(a.ok && b.ok).toBe(true);
    expect(timers).toHaveLength(0);
    expect(commandesRows()).toHaveLength(1);
  });
});
