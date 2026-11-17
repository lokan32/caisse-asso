import { fr } from '../i18n/fr';
import { syncWithReconnect, useSyncState } from '../sync';
import { useGoogleAccount, usePending } from './usePending';
import { toast } from './components';

/** Home-screen status: account connected or not, and how many orders still need syncing. */
export function SyncIndicator() {
  const account = useGoogleAccount();
  const pending = usePending();
  const state = useSyncState();
  if (account === undefined) return null;
  return (
    <>
      {state.status === 'needs-auth' && account && (
        <div class="banner warning" data-testid="reconnect-banner">
          <p style={{ margin: '0 0 8px' }}>{fr.sync.reconnectNeeded}</p>
          <button
            class="btn"
            onClick={() => syncWithReconnect().catch((e: Error) => toast(e.message))}
          >
            {fr.sync.reconnect}
          </button>
        </div>
      )}
      <a class="sync-indicator" href="#/export" data-testid="sync-indicator">
        <span class={`pill ${account ? '' : 'pending'}`}>
          {account ? fr.sync.connected : fr.sync.notConnected}
        </span>
        <span data-testid="pending-count">
          {state.status === 'syncing' ? fr.sync.syncing : fr.sync.pending(pending.orders)}
        </span>
      </a>
    </>
  );
}
