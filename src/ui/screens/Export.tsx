import { useEffect, useState } from 'preact/hooks';
import { fr } from '../../i18n/fr';
import { Layout } from '../Layout';
import { useLiveQuery, useSettings } from '../hooks';
import {
  importCatalogNow,
  replaceRemoteCatalog,
  syncWithReconnect,
  useSyncState,
} from '../../sync';
import { spreadsheetUrl } from '../../sync/google-api';
import { useGoogleAccount, usePending } from '../usePending';
import { ConnectButton } from '../AccountSection';
import { confirmDialog } from '../components';
import { catalogSyncKey, db } from '../../db/db';
import { eventDisplayName, listEvents } from '../../db/events';
import { listEventTypes, typeName } from '../../db/event-types';
import type { EventType, PosEvent } from '../../db/types';
import { configFileName, type CatalogImport } from '../../sync/sync-ops';
import { formatDateTime } from '../../lib/dates';
import type { SyncResult } from '../../sync/engine';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function ExportScreen() {
  const account = useGoogleAccount();
  const pending = usePending();
  const state = useSyncState();
  const online = useOnline();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [imported, setImported] = useState<CatalogImport | 'not-found' | null>(null);
  const [importError, setImportError] = useState('');

  const events = useLiveQuery(listEvents, [], [] as PosEvent[]);
  const types = useLiveQuery(listEventTypes, [], [] as EventType[]);
  // Configuration spreadsheets already written, one per event type.
  const configs = useLiveQuery(
    async () => {
      const all = await listEventTypes();
      const states = await db.syncState.bulkGet(all.map((t) => catalogSyncKey(t.id)));
      return all.flatMap((t, i) => {
        const fileId = states[i]?.fileId;
        return fileId ? [{ type: t, fileId }] : [];
      });
    },
    [],
    [] as { type: EventType; fileId: string }[],
  );
  const sheetEvent =
    events.find((e) => e.id === settings.activeEventId && e.spreadsheetId) ??
    events.find((e) => e.spreadsheetId);

  const syncNow = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await syncWithReconnect());
    } catch (e) {
      setResult({ ok: false, status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!(await confirmDialog(fr.exportScreen.importConfirm, { danger: true }))) return;
    setBusy(true);
    setImportError('');
    try {
      setImported((await importCatalogNow()) ?? 'not-found');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title={fr.exportScreen.title}>
      {!online && (
        <div class="banner warning" data-testid="offline">
          {fr.exportScreen.offline}
        </div>
      )}

      <section class="card">
        <h2>{fr.settings.account}</h2>
        {account === null && <ConnectButton busy={busy} setBusy={setBusy} />}
        {account && <p data-testid="export-email">{account.email}</p>}
        <p data-testid="export-pending">
          <strong>{fr.sync.pending(pending.orders)}</strong>
          {sheetEvent?.lastSyncAt && (
            <span class="muted">
              {' '}
              · {fr.sync.lastSync} : {formatDateTime(sheetEvent.lastSyncAt)}
            </span>
          )}
        </p>
        {account && (
          <button
            class="btn primary big"
            onClick={syncNow}
            disabled={busy || !online}
            data-testid="sync-now"
          >
            {busy || state.status === 'syncing' ? fr.sync.syncing : fr.exportScreen.syncNow}
          </button>
        )}
        {result?.ok && (
          <div class="banner success" style={{ marginTop: '12px' }} data-testid="sync-result">
            {fr.exportScreen.success}
          </div>
        )}
        {result && !result.ok && (
          <div class="banner error" style={{ marginTop: '12px' }} data-testid="sync-result">
            <strong>{fr.exportScreen.error}</strong>
            {result.status === 'needs-auth'
              ? ` : ${fr.sync.reconnectNeeded}`
              : result.error
                ? ` : ${result.error}`
                : ''}
            <div>{fr.exportScreen.stillPending(pending.items)}</div>
          </div>
        )}
      </section>

      {state.configConflicts.map((c) => {
        const file = configFileName(typeName(types, c.typeId));
        return (
          <section key={c.typeId} class="banner warning" data-testid="config-conflict">
            <p style={{ marginTop: 0 }}>{fr.exportScreen.conflict(file)}</p>
            <div class="row">
              <button class="btn primary" onClick={doImport} disabled={busy}>
                {fr.exportScreen.importCatalog}
              </button>
              <button
                class="btn danger"
                disabled={busy}
                data-testid="replace-remote"
                onClick={async () => {
                  if (
                    !(await confirmDialog(fr.exportScreen.replaceConfirm(file), { danger: true }))
                  )
                    return;
                  setBusy(true);
                  try {
                    setResult(await replaceRemoteCatalog(c.typeId, c.fileId));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {fr.exportScreen.replaceRemote(file)}
              </button>
            </div>
          </section>
        );
      })}

      {(sheetEvent || configs.length > 0) && (
        <section class="card">
          {sheetEvent?.spreadsheetId && (
            <p>
              <a
                href={spreadsheetUrl(sheetEvent.spreadsheetId)}
                target="_blank"
                rel="noopener"
                data-testid="event-sheet-link"
              >
                {fr.exportScreen.openSheet} —{' '}
                {sheetEvent.spreadsheetName ?? eventDisplayName(sheetEvent)}
              </a>
            </p>
          )}
          {configs.map(({ type, fileId }) => (
            <p key={type.id}>
              <a
                href={spreadsheetUrl(fileId)}
                target="_blank"
                rel="noopener"
                data-testid="config-link"
              >
                {fr.exportScreen.openConfig(configFileName(type.name))}
              </a>
            </p>
          ))}
        </section>
      )}

      {account && (
        <section class="card">
          <button
            class="btn"
            onClick={doImport}
            disabled={busy || !online}
            data-testid="import-catalog"
          >
            {fr.exportScreen.importCatalog}
          </button>
          {imported === 'not-found' && <p class="banner warning">{fr.exportScreen.notFound}</p>}
          {imported && imported !== 'not-found' && (
            <div class="banner success" data-testid="import-result" style={{ marginTop: '12px' }}>
              {fr.exportScreen.imported(imported.products)}
              <div>{fr.exportScreen.importedTypes(imported.types)}</div>
              {imported.problems.length > 0 && (
                <>
                  <div>
                    <strong>{fr.exportScreen.skipped}</strong>
                  </div>
                  <ul>
                    {imported.problems.map((p) => (
                      <li key={`${p.sheet}-${p.row}`}>
                        {p.sheet}, ligne {p.row} : {p.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {importError && <p class="banner error">{importError}</p>}
        </section>
      )}

      <p class="muted">{fr.exportScreen.overwriteNote}</p>
    </Layout>
  );
}
