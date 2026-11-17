import { AuthError, ConfigConflictError, GoogleApi } from './google-api';

export type SyncStatus =
  'idle' | 'syncing' | 'ok' | 'error' | 'needs-auth' | 'offline' | 'disconnected';

export interface SyncState {
  status: SyncStatus;
  error?: string;
  lastSuccessAt?: number;
  /** Spreadsheet ids written by the last pass. */
  lastEventFileId?: string;
  lastConfigFileId?: string;
  /** Set when an existing pos-config needs a decision (import or replace). */
  configConflict?: string;
}

export interface EngineDeps {
  /** null when no Google account is connected; throws AuthError when it must reconnect. */
  getApi(): Promise<GoogleApi | null>;
  isOnline(): boolean;
  dirty(): Promise<{ catalog: boolean; events: { id: string }[] }>;
  syncCatalog(api: GoogleApi): Promise<string>;
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
  let state: SyncState = { status: 'idle' };
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
      if (dirty.catalog) {
        try {
          setState({ lastConfigFileId: await deps.syncCatalog(api), configConflict: undefined });
        } catch (e) {
          if (!(e instanceof ConfigConflictError)) throw e;
          setState({ configConflict: e.fileId });
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
      if ((after.catalog && !state.configConflict) || after.events.length) schedule(debounceMs);
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
    clearConflict: () => setState({ configConflict: undefined }),
    subscribe(l: (s: SyncState) => void) {
      listeners.add(l);
      l(state);
      return () => void listeners.delete(l);
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
