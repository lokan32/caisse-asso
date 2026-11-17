import { useEffect, useState } from 'preact/hooks';
import { createSyncEngine, type SyncState } from './engine';
import { AuthError, GoogleApi } from './google-api';
import { connect, getAccount, invalidateToken, tokenValid } from './auth';
import { adoptConfigFile, dirtyItems, importCatalog, syncCatalog, syncEvent } from './sync-ops';
import { getSettings } from '../db/settings';
import { onSyncRequest } from './hooks';

export const sync = createSyncEngine({
  async getApi() {
    const account = await getAccount();
    if (!account) return null;
    if (tokenValid(account)) return new GoogleApi(account.token);
    // Renewing needs a user gesture (popup): ask the user to reconnect.
    throw new AuthError();
  },
  isOnline: () => navigator.onLine,
  dirty: dirtyItems,
  syncCatalog,
  syncEvent,
  activeEventId: async () => (await getSettings()).activeEventId,
  onAuthError: invalidateToken,
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
});

let started = false;

/** Wire automatic triggers: local changes, connectivity back, app back to foreground, startup. */
export function startSync() {
  if (started) return;
  started = true;
  onSyncRequest((reason) => {
    if (reason === 'change') sync.notifyChange();
    else void sync.syncNow();
  });
  window.addEventListener('online', () => void sync.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync.syncNow();
  });
  void sync.syncNow();
}

/** From a click: connect (or reconnect) the Google account, then sync. */
export async function connectAndSync() {
  await connect();
  return sync.syncNow();
}

/** From a click: renew the token if needed (may open the Google popup), then sync. */
export async function syncWithReconnect() {
  const account = await getAccount();
  if (account && !tokenValid(account) && navigator.onLine) await connect();
  return sync.syncNow();
}

export async function importCatalogNow() {
  const account = await getAccount();
  if (!account) throw new AuthError('Compte Google non connecté');
  if (!tokenValid(account)) await connect();
  const fresh = await getAccount();
  const result = await importCatalog(new GoogleApi(fresh!.token!));
  sync.clearConflict();
  return result;
}

/** Overwrite an existing pos-config-<type> with this device's configuration (explicit user choice). */
export async function replaceRemoteCatalog(typeId: string, fileId: string) {
  await adoptConfigFile(typeId, fileId);
  sync.clearConflict(typeId);
  return syncWithReconnect();
}

export function useSyncState(): SyncState {
  const [s, setS] = useState(sync.getState());
  useEffect(() => sync.subscribe(setS), []);
  return s;
}
