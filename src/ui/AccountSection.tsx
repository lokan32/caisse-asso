import { useState } from 'preact/hooks';
import { fr } from '../i18n/fr';
import { clientId, disconnect } from '../sync/auth';
import { connectAndSync } from '../sync';
import { useGoogleAccount } from './usePending';
import { confirmDialog, toast } from './components';

export function AccountSection() {
  const account = useGoogleAccount();
  const [busy, setBusy] = useState(false);
  return (
    <section class="card" data-testid="account">
      <h2>{fr.settings.account}</h2>
      {!clientId && <p class="banner warning">{fr.settings.noClientId}</p>}
      {account ? (
        <div class="row">
          <span data-testid="account-email" style={{ flex: 1 }}>
            {account.email}
          </span>
          <button
            class="btn"
            onClick={async () => {
              if (await confirmDialog(`${fr.settings.disconnect} ${account.email} ?`))
                await disconnect();
            }}
          >
            {fr.settings.disconnect}
          </button>
        </div>
      ) : (
        <ConnectButton busy={busy} setBusy={setBusy} />
      )}
    </section>
  );
}

export function ConnectButton(props: { busy: boolean; setBusy: (b: boolean) => void }) {
  return (
    <button
      class="btn primary"
      disabled={!clientId || props.busy}
      data-testid="connect-google"
      onClick={async () => {
        props.setBusy(true);
        try {
          await connectAndSync();
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e));
        } finally {
          props.setBusy(false);
        }
      }}
    >
      {fr.settings.connect}
    </button>
  );
}
