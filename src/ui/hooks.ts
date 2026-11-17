import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, getSettings, type Settings } from '../db/settings';

/** Re-runs the query whenever the underlying IndexedDB data changes. */
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(v),
      error: (e) => console.error(e),
    });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** Re-render every `ms` (for clocks and "last 30 minutes"). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
