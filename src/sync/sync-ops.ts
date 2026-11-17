import { db, newId } from '../db/db';
import { CATALOG_SYNC_KEY, replaceCatalog } from '../db/catalog';
import { baseSpreadsheetName, uniqueSpreadsheetName } from '../db/events';
import { listOrders } from '../db/orders';
import { fr } from '../i18n/fr';
import {
  ApiError,
  ConfigConflictError,
  appPropQuery,
  FOLDER_MIME,
  GoogleApi,
  sheetRange,
  SPREADSHEET_MIME,
} from './google-api';
import {
  buildConfigTabs,
  buildEventSheets,
  parseConfigTabs,
  type ImportResult,
  type Tab,
} from './sheets-layout';

const S = fr.sheets;
const FOLDER_KEY = 'folder';
const CURRENCY_FORMAT = { type: 'CURRENCY', pattern: '#,##0.00 [$€-40C]' };
const PERCENT_FORMAT = { type: 'PERCENT', pattern: '0.0%' };

/* ---------------- Drive files ---------------- */

async function ensureFolder(api: GoogleApi): Promise<string> {
  const cached = await db.syncState.get(FOLDER_KEY);
  if (cached?.fileId) return cached.fileId;
  const found = await api.listFiles(
    `${appPropQuery('posApp', 'folder')} and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const id =
    found[0]?.id ??
    (
      await api.createFile({
        name: S.folder,
        mimeType: FOLDER_MIME,
        appProperties: { posApp: 'folder' },
      })
    ).id;
  await db.syncState.put({ key: FOLDER_KEY, revision: 0, syncedRevision: 0, fileId: id });
  return id;
}

export async function findConfigFile(api: GoogleApi): Promise<string | null> {
  const found = await api.listFiles(
    `${appPropQuery('posApp', 'config')} and mimeType='${SPREADSHEET_MIME}' and trashed=false`,
  );
  return found[0]?.id ?? null;
}

async function createSpreadsheet(
  api: GoogleApi,
  name: string,
  appProperties: Record<string, string>,
): Promise<string> {
  const folder = await ensureFolder(api);
  const file = await api.createFile({
    name,
    mimeType: SPREADSHEET_MIME,
    parents: [folder],
    appProperties,
  });
  await api.batchUpdate(file.id, [
    { updateSpreadsheetProperties: { properties: { locale: 'fr_FR' }, fields: 'locale' } },
  ]);
  return file.id;
}

/** True when the cached spreadsheet still exists (it may have been deleted by the user). */
async function exists(api: GoogleApi, id: string): Promise<boolean> {
  try {
    await api.getSheets(id);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false;
    throw e;
  }
}

/**
 * Make the spreadsheet contain exactly `titles`, in that order (other tabs removed).
 * Returns sheetIds by title.
 */
async function ensureTabs(
  api: GoogleApi,
  id: string,
  titles: string[],
): Promise<Map<string, number>> {
  const existing = await api.getSheets(id);
  const have = new Set(existing.map((s) => s.title));
  const add = titles
    .filter((t) => !have.has(t))
    .map((title) => ({ addSheet: { properties: { title } } }));
  const remove = existing
    .filter((s) => !titles.includes(s.title))
    .map((s) => ({ deleteSheet: { sheetId: s.sheetId } }));
  // Add first so a spreadsheet never ends up with zero sheets.
  await api.batchUpdate(id, [...add, ...remove]);
  const now = await api.getSheets(id);
  const byTitle = new Map(now.map((s) => [s.title, s.sheetId]));
  await api.batchUpdate(
    id,
    titles.map((t, index) => ({
      updateSheetProperties: { properties: { sheetId: byTitle.get(t), index }, fields: 'index' },
    })),
  );
  return byTitle;
}

/** Full rewrite of tabs: clear then write. Idempotent. */
async function rewrite(api: GoogleApi, id: string, tabs: Tab[]) {
  await api.clearValues(
    id,
    tabs.map((t) => sheetRange(t.title, '')),
  );
  await api.writeValues(
    id,
    tabs.map((t) => ({ range: sheetRange(t.title), values: t.rows })),
  );
}

function columnFormat(sheetId: number, col: number, numberFormat: object) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
      cell: { userEnteredFormat: { numberFormat } },
      fields: 'userEnteredFormat.numberFormat',
    },
  };
}

/* ---------------- pos-config ---------------- */

export async function syncCatalog(api: GoogleApi): Promise<string> {
  const state = (await db.syncState.get(CATALOG_SYNC_KEY)) ?? {
    key: CATALOG_SYNC_KEY,
    revision: 0,
    syncedRevision: 0,
  };
  const captured = state.revision;
  const [categories, products] = await Promise.all([
    db.categories.toArray(),
    db.products.toArray(),
  ]);

  let id = state.fileId && (await exists(api, state.fileId)) ? state.fileId : null;
  if (!id) {
    const found = await findConfigFile(api);
    // Never silently overwrite a catalog written by another device.
    if (found && !state.fileId) throw new ConfigConflictError(found);
    id = found ?? (await createSpreadsheet(api, S.config, { posApp: 'config' }));
  }

  const tabs = buildConfigTabs(categories, products);
  // A spreadsheet needs at least one tab, even with an empty catalog.
  const effective = tabs.length ? tabs : [{ title: 'Catégorie', rows: [[...S.configHeaders]] }];
  const ids = await ensureTabs(
    api,
    id,
    effective.map((t) => t.title),
  );
  await rewrite(api, id, effective);
  await api.batchUpdate(
    id,
    effective.flatMap((t) => [
      columnFormat(ids.get(t.title)!, 2, CURRENCY_FORMAT),
      columnFormat(ids.get(t.title)!, 3, CURRENCY_FORMAT),
    ]),
  );

  await db.transaction('rw', db.syncState, async () => {
    const cur = (await db.syncState.get(CATALOG_SYNC_KEY)) ?? state;
    await db.syncState.put({
      ...cur,
      fileId: id,
      syncedRevision: Math.max(cur.syncedRevision, captured),
      lastSyncAt: Date.now(),
    });
  });
  return id;
}

export async function importCatalog(api: GoogleApi): Promise<ImportResult | null> {
  const id = await findConfigFile(api);
  if (!id) return null;
  const sheets = (await api.getSheets(id)).sort((a, b) => a.index - b.index);
  const values = await api.readValues(
    id,
    sheets.map((s) => sheetRange(s.title, 'A1:F')),
  );
  const result = parseConfigTabs(
    sheets.map((s, i) => ({ title: s.title, rows: values[i] ?? [] })),
    newId,
  );
  await replaceCatalog(result.categories, result.products);
  // The device now matches pos-config: nothing to push back.
  await db.transaction('rw', db.syncState, async () => {
    const cur = (await db.syncState.get(CATALOG_SYNC_KEY)) ?? {
      key: CATALOG_SYNC_KEY,
      revision: 0,
      syncedRevision: 0,
    };
    await db.syncState.put({
      ...cur,
      fileId: id,
      syncedRevision: cur.revision,
      lastSyncAt: Date.now(),
    });
  });
  return result;
}

/** The user chose to replace the existing pos-config with this device's catalog. */
export async function adoptConfigFile(fileId: string) {
  await db.transaction('rw', db.syncState, async () => {
    const cur = (await db.syncState.get(CATALOG_SYNC_KEY)) ?? {
      key: CATALOG_SYNC_KEY,
      revision: 0,
      syncedRevision: 0,
    };
    await db.syncState.put({
      ...cur,
      fileId,
      revision: Math.max(cur.revision, cur.syncedRevision + 1),
    });
  });
}

/* ---------------- event-<date> ---------------- */

export async function syncEvent(api: GoogleApi, eventId: string): Promise<string> {
  const event = await db.events.get(eventId);
  if (!event) throw new Error('Évènement introuvable');
  const captured = event.revision;
  const orders = await listOrders(eventId);

  let id =
    event.spreadsheetId && (await exists(api, event.spreadsheetId))
      ? event.spreadsheetId
      : undefined;
  let name = event.spreadsheetName;
  if (!id) {
    const mine = await api.listFiles(`${appPropQuery('eventId', event.id)} and trashed=false`);
    if (mine[0]) {
      id = mine[0].id;
      name = mine[0].name;
    } else {
      const others = await api.listFiles(`${appPropQuery('posApp', 'event')} and trashed=false`);
      name = uniqueSpreadsheetName(
        baseSpreadsheetName(event),
        others.map((f) => f.name),
      );
      id = await createSpreadsheet(api, name, { posApp: 'event', eventId: event.id });
    }
  }

  const sheets = buildEventSheets(event, orders, Date.now());
  const ids = await ensureTabs(api, id, [S.orders, S.summary]);
  await rewrite(api, id, [
    { title: S.orders, rows: sheets.orders },
    { title: S.summary, rows: sheets.summary },
  ]);
  const ordersId = ids.get(S.orders)!;
  const summaryId = ids.get(S.summary)!;
  await api.batchUpdate(id, [
    ...sheets.ordersMoneyColumns.map((c) => columnFormat(ordersId, c, CURRENCY_FORMAT)),
    columnFormat(summaryId, 3, CURRENCY_FORMAT),
    columnFormat(summaryId, 4, CURRENCY_FORMAT),
    columnFormat(summaryId, 5, CURRENCY_FORMAT),
    columnFormat(summaryId, 6, PERCENT_FORMAT),
  ]);

  await db.transaction('rw', db.events, async () => {
    const cur = await db.events.get(eventId);
    if (!cur) return;
    await db.events.update(eventId, {
      spreadsheetId: id,
      spreadsheetName: name,
      syncedRevision: Math.max(cur.syncedRevision, captured),
      lastSyncAt: Date.now(),
    });
  });
  return id;
}

/** Things that still need to be written to Drive. */
export async function dirtyItems() {
  const catalog = await db.syncState.get(CATALOG_SYNC_KEY);
  const events = (await db.events.toArray()).filter((e) => e.revision > e.syncedRevision);
  return { catalog: !!catalog && catalog.revision > catalog.syncedRevision, events };
}
