import { db } from '../db/db';
import { pendingOrdersCount } from '../db/orders';
import { dirtyItems } from '../sync/sync-ops';
import { getAccount, type GoogleAccount } from '../sync/auth';
import { useLiveQuery } from './hooks';

/** Orders (all events) not yet written to Drive, and whether some event type's buttons are pending. */
export function usePending() {
  return useLiveQuery(
    async () => {
      const events = await db.events.toArray();
      let orders = 0;
      for (const e of events) orders += await pendingOrdersCount(e);
      const { catalogTypes } = await dirtyItems();
      const eventsDirty = events.filter((e) => e.revision > e.syncedRevision).length;
      return {
        orders,
        catalog: catalogTypes.length > 0,
        items: orders + catalogTypes.length + (orders === 0 ? eventsDirty : 0),
      };
    },
    [],
    { orders: 0, catalog: false, items: 0 },
  );
}

export function useGoogleAccount(): GoogleAccount | null | undefined {
  return useLiveQuery(getAccount, [], undefined as GoogleAccount | null | undefined);
}
