import { AuthError, ConfigConflictError, GoogleApi } from './google-api';

export type SyncStatus =
  'idle' | 'syncing' | 'ok' | 'error' | 'needs-auth' | 'offline' | 'disconnected';

export interface SyncState {
  status: SyncStatus;
  error?: string;
  lastSuccessAt?: number;
  /** Event spreadsheet id written by the last pass. */
  lastEventFileId?: string;
  /** Event types whose existing pos-config-<type> needs a decision (import or replace). */
  configConflicts: ConfigConflict[];
}

export interface ConfigConflict {
  typeId: string;
  fileId: string;
}

export interface EngineDeps {
  /** null when no Google account is connected; throws AuthError when it must reconnect. */
  getApi(): Promise<GoogleApi | null>;
  isOnline(): boolean;
  dirty(): Promise<{ catalogTypes: string[]; events: { id: string }[] }>;
  syncCatalog(api: GoogleApi, typeId: string): Promise<string>;
  syncEvent(api: GoogleApi, eventId: string): Promise<string>;
  activeEventId(): Promise<string | null>;
  onAuthError(): Promise<void>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  debounceMs?: number;
}

export interface SyncResult {
  ok: boolean;
  error?: string;
  status: SyncStatus;
}

/**
 * Offline-first sync scheduler: one pass at a time, debounced after changes,
 * exponential backoff after errors. A pass rewrites every dirty spreadsheet.
 */
export function createSyncEngine(deps: EngineDeps) {
  const debounceMs = deps.debounceMs ?? 5000;
  let state: SyncState = { status: 'idle', configConflicts: [] };
  const withoutConflict = (typeId: string) =>
    state.configConflicts.filter((c) => c.typeId !== typeId);
  const inConflict = (typeId: string) => state.configConflicts.some((c) => c.typeId === typeId);
  const listeners = new Set<(s: SyncState) => void>();
  let running: Promise<SyncResult> | null = null;
  let rerun = false;
  let timer: unknown = null;
  let failures = 0;

  const setState = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };

  const schedule = (ms: number) => {
    if (timer) deps.clearTimeout(timer);
    timer = deps.setTimeout(() => {
      timer = null;
      void syncNow();
    }, ms);
  };

  async function pass(): Promise<SyncResult> {
    if (!deps.isOnline()) {
      setState({ status: 'offline' });
      return { ok: false, status: 'offline' };
    }
    let api: GoogleApi | null;
    try {
      api = await deps.getApi();
    } catch (e) {
      if (e instanceof AuthError) {
        setState({ status: 'needs-auth', error: e.message });
        return { ok: false, status: 'needs-auth', error: e.message };
      }
      throw e;
    }
    if (!api) {
      setState({ status: 'disconnected' });
      return { ok: false, status: 'disconnected' };
    }
    setState({ status: 'syncing', error: undefined });
    try {
      const dirty = await deps.dirty();
      for (const typeId of dirty.catalogTypes) {
        try {
          await deps.syncCatalog(api, typeId);
          setState({ configConflicts: withoutConflict(typeId) });
        } catch (e) {
          if (!(e instanceof ConfigConflictError)) throw e;
          // A conflict blocks only its own type.
          setState({
            configConflicts: [...withoutConflict(typeId), { typeId, fileId: e.fileId }],
          });
        }
      }
      const active = await deps.activeEventId();
      for (const e of dirty.events) {
        const fileId = await deps.syncEvent(api, e.id);
        if (e.id === active || !state.lastEventFileId) setState({ lastEventFileId: fileId });
      }
      failures = 0;
      setState({ status: 'ok', lastSuccessAt: Date.now() });
      // Something changed during the upload: go again.
      const after = await deps.dirty();
      if (after.catalogTypes.some((t) => !inConflict(t)) || after.events.length)
        schedule(debounceMs);
      return { ok: true, status: 'ok' };
    } catch (e) {
      if (e instanceof AuthError) {
        await deps.onAuthError();
        setState({ status: 'needs-auth', error: e.message });
        return { ok: false, status: 'needs-auth', error: e.message };
      }
      failures++;
      const message = e instanceof Error ? e.message : String(e);
      setState({ status: 'error', error: message });
      schedule(Math.min(5 * 60_000, debounceMs * 2 ** failures));
      return { ok: false, status: 'error', error: message };
    }
  }

  async function syncNow(): Promise<SyncResult> {
    if (running) {
      rerun = true;
      return running;
    }
    if (timer) {
      deps.clearTimeout(timer);
      timer = null;
    }
    running = (async () => {
      let result: SyncResult;
      do {
        rerun = false;
        result = await pass();
      } while (rerun && result.ok);
      return result;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  return {
    /** A local change happened: sync after a short delay (batches bursts of orders). */
    notifyChange() {
      schedule(debounceMs);
    },
    syncNow,
    getState: () => state,
    /** Forget the conflict of one type, or all of them. */
    clearConflict: (typeId?: string) =>
      setState({ configConflicts: typeId ? withoutConflict(typeId) : [] }),
    subscribe(l: (s: SyncState) => void) {
      listeners.add(l);
      l(state);
      return () => void listeners.delete(l);
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
