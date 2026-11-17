import { db } from '../db/db';
import type { PosEvent } from '../db/types';
import { getSettings } from '../db/settings';
import { listOrders } from '../db/orders';
import { aggregate, type EventStats } from '../lib/aggregate';
import { useLiveQuery } from './hooks';

/**
 * Live stats of an event (explicit id, else the active event, else the most recent one).
 * Recomputed on every change to orders, so it updates without refresh and offline.
 */
export function useEventStats(eventId: string | null, tick: number) {
  return useLiveQuery(
    async () => {
      let event: PosEvent | undefined;
      if (eventId) event = await db.events.get(eventId);
      if (!event) {
        const { activeEventId } = await getSettings();
        event = activeEventId ? await db.events.get(activeEventId) : undefined;
        if (event?.status === 'closed') event = undefined;
      }
      if (!event) return null;
      const orders = await listOrders(event.id);
      // Read the clock on every recompute so a brand-new order counts in "last 30 min";
      // `tick` only forces a periodic refresh while nothing changes.
      return { event, stats: aggregate(orders, { floatCents: event.floatCents, now: Date.now() }) };
    },
    [eventId, tick],
    undefined as { event: PosEvent; stats: EventStats } | null | undefined,
  );
}
