import { db } from '../db/db';
import type { PosEvent } from '../db/types';
import { getSettings } from '../db/settings';
import { useLiveQuery } from './hooks';

/** Active open event, or null. `undefined` while loading. */
export function useActiveEvent(): PosEvent | null | undefined {
  return useLiveQuery(
    async () => {
      const { activeEventId } = await getSettings();
      if (!activeEventId) return null;
      const e = await db.events.get(activeEventId);
      return e && e.status === 'open' ? e : null;
    },
    [],
    undefined as PosEvent | null | undefined,
  );
}
