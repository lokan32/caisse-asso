import { beforeEach, describe, expect, test } from 'vitest';
import { freshDb } from './testing';
import { startEvent, closeEvent } from './events';
import {
  adjustReceived,
  editOrder,
  EmptyOrderError,
  listOrders,
  pendingOrdersCount,
  recordOrder,
  voidOrder,
} from './orders';
import { db } from './db';
import type { OrderLine } from './types';

const beer = (qty: number): OrderLine => ({
  productId: 'beer',
  name: 'Bière',
  category: 'Boissons',
  qty,
  unitPriceCents: 250,
  unitCostCents: 100,
});
const chips = (qty: number): OrderLine => ({
  productId: 'chips',
  name: 'Chips',
  category: 'Nourriture',
  qty,
  unitPriceCents: 100,
  unitCostCents: 40,
});
const coffee = (qty: number, price = 150): OrderLine => ({
  productId: 'coffee',
  name: 'Café',
  category: 'Boissons',
  qty,
  unitPriceCents: price,
  unitCostCents: 30,
});

beforeEach(async () => {
  await freshDb();
});

describe('orders', () => {
  test('stored record has snapshot lines, sequence number and totals', async () => {
    const e = await startEvent({ startDate: '2026-11-21' });
    const o1 = await recordOrder(e.id, [beer(2), chips(1), coffee(0)], 1000);
    const o2 = await recordOrder(e.id, [beer(1)]);
    expect(o1).toMatchObject({
      eventId: e.id,
      seq: 1,
      status: 'ok',
      totalCents: 600,
      costCents: 240,
      receivedCents: 1000,
      lines: [beer(2), chips(1)],
    });
    expect(o1.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(o2.seq).toBe(2);
    expect((await db.events.get(e.id))?.nextSeq).toBe(3);
    expect((await listOrders(e.id)).map((o) => o.seq)).toEqual([1, 2]);
  });

  test('empty orders are refused', async () => {
    const e = await startEvent();
    await expect(recordOrder(e.id, [])).rejects.toBeInstanceOf(EmptyOrderError);
    await expect(recordOrder(e.id, [beer(0)])).rejects.toBeInstanceOf(EmptyOrderError);
  });

  test('closed events refuse new orders, edits and voids', async () => {
    const e = await startEvent();
    const o = await recordOrder(e.id, [beer(1)]);
    await closeEvent(e.id);
    await expect(recordOrder(e.id, [beer(1)])).rejects.toThrow();
    await expect(editOrder(o.id, [beer(2)])).rejects.toThrow();
    await expect(voidOrder(o.id)).rejects.toThrow();
  });

  test('editing keeps number, time and original prices', async () => {
    const e = await startEvent();
    await recordOrder(e.id, [beer(1)]);
    const o = await recordOrder(e.id, [beer(2), coffee(1, 150)], 1000);
    // Catalog price of coffee is now 2,00: the existing line keeps 1,50.
    const edited = await editOrder(o.id, [beer(1), coffee(1, 150)]);
    expect(edited).toMatchObject({
      id: o.id,
      seq: 2,
      createdAt: o.createdAt,
      status: 'modified',
      totalCents: 400,
    });
    expect(edited.updatedAt).toBeGreaterThanOrEqual(o.createdAt);
    expect(edited.lines.find((l) => l.productId === 'coffee')?.unitPriceCents).toBe(150);
    expect(await db.orders.where({ eventId: e.id }).count()).toBe(2);
  });

  test('edits cannot empty an order or touch voided orders', async () => {
    const e = await startEvent();
    const o = await recordOrder(e.id, [beer(1)]);
    await expect(editOrder(o.id, [beer(0)])).rejects.toBeInstanceOf(EmptyOrderError);
    await voidOrder(o.id);
    expect((await db.orders.get(o.id))?.status).toBe('voided');
    await expect(editOrder(o.id, [beer(2)])).rejects.toThrow();
  });

  test('pending counter follows revisions', async () => {
    const e = await startEvent();
    const o = await recordOrder(e.id, [beer(1)]);
    await recordOrder(e.id, [beer(1)]);
    let ev = (await db.events.get(e.id))!;
    expect(await pendingOrdersCount(ev)).toBe(2);
    await db.events.update(e.id, { syncedRevision: ev.revision });
    ev = (await db.events.get(e.id))!;
    expect(await pendingOrdersCount(ev)).toBe(0);
    await voidOrder(o.id);
    ev = (await db.events.get(e.id))!;
    expect(await pendingOrdersCount(ev)).toBe(1);
  });

  test('cash adjustment on edit', () => {
    // Paid 5,00 for 4,00 (1,00 given back), edited to 6,50: collect 2,50 more.
    expect(adjustReceived({ totalCents: 400, receivedCents: 500 }, 650)).toEqual({
      diffCents: 250,
      receivedCents: 750,
    });
    // Edited down from 6,00 to 4,00: give 2,00 back.
    expect(adjustReceived({ totalCents: 600, receivedCents: 600 }, 400)).toEqual({
      diffCents: -200,
      receivedCents: 600,
    });
    // No amount recorded originally.
    expect(adjustReceived({ totalCents: 400 }, 650)).toEqual({
      diffCents: 250,
      receivedCents: 650,
    });
  });
});
