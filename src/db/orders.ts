import { db, newId } from './db';
import type { Order, OrderLine, PosEvent } from './types';
import { EventClosedError } from './events';
import { linesCost, linesTotal } from '../lib/aggregate';

export class EmptyOrderError extends Error {
  constructor() {
    super('Commande vide');
  }
}

export class OrderVoidedError extends Error {
  constructor() {
    super('Commande annulée');
  }
}

function cleanLines(lines: readonly OrderLine[]): OrderLine[] {
  const out = lines.filter((l) => l.qty > 0).map((l) => ({ ...l }));
  if (out.length === 0) throw new EmptyOrderError();
  return out;
}

async function openEvent(eventId: string): Promise<PosEvent> {
  const e = await db.events.get(eventId);
  if (!e) throw new Error('Évènement introuvable');
  if (e.status === 'closed') throw new EventClosedError();
  return e;
}

/** Record a new order on the device (works offline). */
export async function recordOrder(
  eventId: string,
  lines: readonly OrderLine[],
  receivedCents?: number,
): Promise<Order> {
  const clean = cleanLines(lines);
  return db.transaction('rw', db.events, db.orders, async () => {
    const e = await openEvent(eventId);
    const revision = e.revision + 1;
    const order: Order = {
      id: newId(),
      eventId,
      seq: e.nextSeq,
      createdAt: Date.now(),
      status: 'ok',
      lines: clean,
      totalCents: linesTotal(clean),
      costCents: linesCost(clean),
      receivedCents,
      revision,
    };
    await db.orders.add(order);
    await db.events.update(eventId, { nextSeq: e.nextSeq + 1, revision });
    return order;
  });
}

/** Replace an order's content; keeps id, number and original time. */
export async function editOrder(
  orderId: string,
  lines: readonly OrderLine[],
  receivedCents?: number,
): Promise<Order> {
  const clean = cleanLines(lines);
  return db.transaction('rw', db.events, db.orders, async () => {
    const o = await db.orders.get(orderId);
    if (!o) throw new Error('Commande introuvable');
    if (o.status === 'voided') throw new OrderVoidedError();
    const e = await openEvent(o.eventId);
    const revision = e.revision + 1;
    const updated: Order = {
      ...o,
      lines: clean,
      totalCents: linesTotal(clean),
      costCents: linesCost(clean),
      receivedCents: receivedCents ?? o.receivedCents,
      status: 'modified',
      updatedAt: Date.now(),
      revision,
    };
    await db.orders.put(updated);
    await db.events.update(e.id, { revision });
    return updated;
  });
}

export async function voidOrder(orderId: string): Promise<void> {
  await db.transaction('rw', db.events, db.orders, async () => {
    const o = await db.orders.get(orderId);
    if (!o) throw new Error('Commande introuvable');
    if (o.status === 'voided') return;
    const e = await openEvent(o.eventId);
    const revision = e.revision + 1;
    await db.orders.update(orderId, { status: 'voided', updatedAt: Date.now(), revision });
    await db.events.update(e.id, { revision });
  });
}

export async function listOrders(eventId: string): Promise<Order[]> {
  return db.orders
    .where('[eventId+seq]')
    .between([eventId, -Infinity], [eventId, Infinity])
    .toArray();
}

/** Orders changed since the last successful sync of their event. */
export async function pendingOrdersCount(
  event: Pick<PosEvent, 'id' | 'syncedRevision'>,
): Promise<number> {
  return db.orders
    .where('[eventId+revision]')
    .between([event.id, event.syncedRevision + 1], [event.id, Infinity])
    .count();
}

/**
 * Cash adjustment when an order is edited: the customer pays the difference or gets it back.
 * Returns the new amount received so that "received − total" stays the change actually given.
 */
export function adjustReceived(
  previous: Pick<Order, 'totalCents' | 'receivedCents'>,
  newTotalCents: number,
) {
  const diff = newTotalCents - previous.totalCents;
  const prevReceived = previous.receivedCents ?? previous.totalCents;
  return {
    diffCents: diff,
    receivedCents: diff > 0 ? prevReceived + diff : prevReceived,
  };
}
