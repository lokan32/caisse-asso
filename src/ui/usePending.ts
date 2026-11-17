import { db } from '../db/db';
import { pendingOrdersCount } from '../db/orders';
import { CATALOG_SYNC_KEY } from '../db/catalog';
import { getAccount, type GoogleAccount } from '../sync/auth';
import { useLiveQuery } from './hooks';

/** Orders (all events) not yet written to Drive, and whether the catalog is pending. */
export function usePending() {
  return useLiveQuery(
    async () => {
      const events = await db.events.toArray();
      let orders = 0;
      for (const e of events) orders += await pendingOrdersCount(e);
      const cat = await db.syncState.get(CATALOG_SYNC_KEY);
      const catalog = !!cat && cat.revision > cat.syncedRevision;
      const eventsDirty = events.filter((e) => e.revision > e.syncedRevision).length;
      return {
        orders,
        catalog,
        items: orders + (catalog ? 1 : 0) + (orders === 0 ? eventsDirty : 0),
      };
    },
    [],
    { orders: 0, catalog: false, items: 0 },
  );
}

export function useGoogleAccount(): GoogleAccount | null | undefined {
  return useLiveQuery(getAccount, [], undefined as GoogleAccount | null | undefined);
}
