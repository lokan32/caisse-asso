import type { Order } from '../db/types';
import { slotStart } from './dates';

export interface ProductStats {
  productId: string;
  name: string;
  category: string;
  qty: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  /** Margin as a fraction of revenue (0.6 = 60 %), null when revenue is 0. */
  marginRate: number | null;
}

export interface CategoryStats {
  category: string;
  qty: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginRate: number | null;
  products: ProductStats[];
}

export interface Slot {
  start: number;
  orders: number;
  revenueCents: number;
}

export interface EventStats {
  ordersCount: number;
  itemsCount: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginRate: number | null;
  averageCents: number;
  floatCents: number;
  expectedCashCents: number;
  /** Products in order of first sale. */
  products: ProductStats[];
  categories: CategoryStats[];
  slots: Slot[];
  last30Cents: number;
}

export interface AggregateOptions {
  slotMinutes?: number;
  floatCents?: number;
  /** Used for "last 30 minutes" and to extend the slot range up to now. */
  now?: number;
}

const rate = (margin: number, revenue: number) => (revenue === 0 ? null : margin / revenue);

/**
 * Compute event statistics from orders. Voided orders are ignored; modified orders count
 * with their current content. Pure function shared by live stats and the Synthèse sheet.
 */
export function aggregate(allOrders: readonly Order[], opts: AggregateOptions = {}): EventStats {
  const slotMinutes = opts.slotMinutes ?? 30;
  const floatCents = opts.floatCents ?? 0;
  const orders = allOrders
    .filter((o) => o.status !== 'voided')
    .slice()
    .sort((a, b) => a.seq - b.seq);

  const byProduct = new Map<string, ProductStats>();
  let itemsCount = 0;
  let revenueCents = 0;
  let costCents = 0;

  for (const order of orders) {
    for (const line of order.lines) {
      if (line.qty <= 0) continue;
      let p = byProduct.get(line.productId);
      if (!p) {
        p = {
          productId: line.productId,
          name: line.name,
          category: line.category,
          qty: 0,
          revenueCents: 0,
          costCents: 0,
          marginCents: 0,
          marginRate: null,
        };
        byProduct.set(line.productId, p);
      }
      // Later orders carry the most recent name/category.
      p.name = line.name;
      p.category = line.category;
      p.qty += line.qty;
      p.revenueCents += line.qty * line.unitPriceCents;
      p.costCents += line.qty * line.unitCostCents;
      itemsCount += line.qty;
      revenueCents += line.qty * line.unitPriceCents;
      costCents += line.qty * line.unitCostCents;
    }
  }

  const products = [...byProduct.values()];
  for (const p of products) {
    p.marginCents = p.revenueCents - p.costCents;
    p.marginRate = rate(p.marginCents, p.revenueCents);
  }

  const catMap = new Map<string, CategoryStats>();
  for (const p of products) {
    let c = catMap.get(p.category);
    if (!c) {
      c = {
        category: p.category,
        qty: 0,
        revenueCents: 0,
        costCents: 0,
        marginCents: 0,
        marginRate: null,
        products: [],
      };
      catMap.set(p.category, c);
    }
    c.qty += p.qty;
    c.revenueCents += p.revenueCents;
    c.costCents += p.costCents;
    c.marginCents += p.marginCents;
    c.products.push(p);
  }
  const categories = [...catMap.values()];
  for (const c of categories) c.marginRate = rate(c.marginCents, c.revenueCents);

  // Time slots, contiguous from the first order to the last order (or now).
  const slots: Slot[] = [];
  if (orders.length > 0) {
    const times = orders.map((o) => o.createdAt);
    const first = slotStart(Math.min(...times), slotMinutes);
    const lastTime = Math.max(...times, opts.now ?? 0);
    const last = slotStart(lastTime, slotMinutes);
    const index = new Map<number, Slot>();
    for (let t = first; t <= last; t = nextSlot(t, slotMinutes)) {
      const s = { start: t, orders: 0, revenueCents: 0 };
      slots.push(s);
      index.set(t, s);
    }
    for (const o of orders) {
      const s = index.get(slotStart(o.createdAt, slotMinutes));
      if (s) {
        s.orders += 1;
        s.revenueCents += o.totalCents;
      }
    }
  }

  const now = opts.now ?? Date.now();
  const last30Cents = orders
    .filter((o) => o.createdAt > now - 30 * 60_000 && o.createdAt <= now)
    .reduce((sum, o) => sum + o.totalCents, 0);

  const marginCents = revenueCents - costCents;
  return {
    ordersCount: orders.length,
    itemsCount,
    revenueCents,
    costCents,
    marginCents,
    marginRate: rate(marginCents, revenueCents),
    averageCents: orders.length ? Math.round(revenueCents / orders.length) : 0,
    floatCents,
    expectedCashCents: floatCents + revenueCents,
    products,
    categories,
    slots,
    last30Cents,
  };
}

/** Next slot start. Guards against DST fall-back, where +30 min can land in the same local slot. */
function nextSlot(t: number, slotMinutes: number): number {
  const step = slotMinutes * 60_000;
  let next = slotStart(t + step, slotMinutes);
  if (next <= t) next = t + step;
  return next;
}

/** Sum of line amounts in cents. */
export function linesTotal(lines: readonly { qty: number; unitPriceCents: number }[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
}

export function linesCost(lines: readonly { qty: number; unitCostCents: number }[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
}
