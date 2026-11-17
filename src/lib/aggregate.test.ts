import { describe, expect, test } from 'vitest';
import type { Order, OrderLine } from '../db/types';
import { aggregate } from './aggregate';

let seq = 0;
const line = (
  productId: string,
  qty: number,
  price: number,
  cost: number,
  category = 'Boissons',
): OrderLine => ({
  productId,
  name: productId,
  category,
  qty,
  unitPriceCents: price,
  unitCostCents: cost,
});
function order(lines: OrderLine[], createdAt = 0, status: Order['status'] = 'ok'): Order {
  const totalCents = lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
  const costCents = lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
  seq += 1;
  return {
    id: `o${seq}`,
    eventId: 'e',
    seq,
    createdAt,
    status,
    lines,
    totalCents,
    costCents,
    revision: seq,
  };
}
const at = (h: number, m: number) => new Date(2026, 10, 21, h, m).getTime();

describe('aggregate', () => {
  test('margin scenario: revenue 200, cost 80 → margin 120, 60 %', () => {
    const s = aggregate([order([line('A', 10, 1000, 400)]), order([line('B', 4, 2500, 1000)])]);
    expect(s.revenueCents).toBe(20000);
    expect(s.costCents).toBe(8000);
    expect(s.marginCents).toBe(12000);
    expect(s.marginRate).toBeCloseTo(0.6);
    expect(s.ordersCount).toBe(2);
    expect(s.itemsCount).toBe(14);
    expect(s.averageCents).toBe(10000);
  });

  test('voided orders are excluded', () => {
    const s = aggregate([
      order([line('Bière', 2, 250, 100)]),
      order([line('Bière', 1, 600, 0)], 0, 'voided'),
    ]);
    expect(s.revenueCents).toBe(500);
    expect(s.ordersCount).toBe(1);
    expect(s.products).toHaveLength(1);
    expect(s.products[0].qty).toBe(2);
  });

  test('modified orders count with their latest content', () => {
    const edited = order([line('Bière', 1, 250, 100), line('Café', 1, 150, 30)], 0, 'modified');
    const s = aggregate([edited]);
    expect(s.revenueCents).toBe(400);
    expect(s.products.map((p) => [p.productId, p.qty])).toEqual([
      ['Bière', 1],
      ['Café', 1],
    ]);
  });

  test('per-product and category breakdown', () => {
    const s = aggregate([
      order([line('Bière', 2, 250, 100), line('Chips', 1, 100, 40, 'Nourriture')]),
      order([line('Bière', 1, 250, 100)]),
    ]);
    const beer = s.products.find((p) => p.productId === 'Bière')!;
    expect(beer).toMatchObject({ qty: 3, revenueCents: 750, costCents: 300, marginCents: 450 });
    expect(beer.marginRate).toBeCloseTo(0.6);
    expect(s.categories.map((c) => [c.category, c.qty, c.revenueCents])).toEqual([
      ['Boissons', 3, 750],
      ['Nourriture', 1, 100],
    ]);
  });

  test('30-minute slots: 30 orders 20:00–20:30, 5 orders 20:30–21:00', () => {
    const orders = [
      ...Array.from({ length: 30 }, (_, i) => order([line('Bière', 1, 250, 100)], at(20, i))),
      ...Array.from({ length: 5 }, (_, i) =>
        order([line('Bière', 1, 250, 100)], at(20, 30 + i * 5)),
      ),
    ];
    const s = aggregate(orders, { now: at(20, 55) });
    expect(s.slots.map((x) => [x.start, x.orders])).toEqual([
      [at(20, 0), 30],
      [at(20, 30), 5],
    ]);
    expect(s.slots[1].revenueCents).toBe(1250);
    // Orders after 20:25 are within the last 30 minutes at 20:55: 20:26..20:29 (4) + 5.
    expect(s.last30Cents).toBe(9 * 250);
  });

  test('slots extend to now and include empty slots', () => {
    const s = aggregate([order([line('Bière', 1, 250, 100)], at(18, 10))], { now: at(19, 40) });
    expect(s.slots.map((x) => x.orders)).toEqual([1, 0, 0, 0]);
  });

  test('expected cash includes the starting float', () => {
    const s = aggregate([order([line('Bière', 120, 250, 100)])], { floatCents: 5000 });
    expect(s.revenueCents).toBe(30000);
    expect(s.expectedCashCents).toBe(35000);
  });

  test('empty event', () => {
    const s = aggregate([]);
    expect(s).toMatchObject({
      ordersCount: 0,
      revenueCents: 0,
      averageCents: 0,
      marginRate: null,
      slots: [],
    });
  });
});
