import { catalogSyncKey, db, newId } from '../db/db';
import { listCategories, listProducts, replaceCatalog } from '../db/catalog';
import { baseSpreadsheetName, uniqueSpreadsheetName } from '../db/events';
import { listOrders } from '../db/orders';
import { fr } from '../i18n/fr';
import {
  ApiError,
  ConfigConflictError,
  appPropQuery,
  type DriveFile,
  FOLDER_MIME,
  GoogleApi,
  sheetRange,
  SPREADSHEET_MIME,
} from './google-api';
import {
  buildConfigTabs,
  buildEventSheets,
  parseConfigTabs,
  type ImportProblem,
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

/* ---------------- pos-config-<type> ---------------- */

/** `pos-config-<type name>`. */
export function configFileName(typeName: string): string {
  return `${S.config}-${typeName}`;
}

/** Type name a configuration file stands for (legacy `pos-config` is the "Général" type). */
export function typeNameOfConfigFile(fileName: string): string {
  if (fileName === S.config) return fr.types.defaultName;
  return fileName.startsWith(`${S.config}-`) ? fileName.slice(S.config.length + 1) : fileName;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');

async function listConfigFiles(api: GoogleApi): Promise<DriveFile[]> {
  return api.listFiles(
    `${appPropQuery('posApp', 'config')} and mimeType='${SPREADSHEET_MIME}' and trashed=false`,
  );
}

async function typeCatalog(typeId: string) {
  const categories = await listCategories(typeId);
  const products = (await Promise.all(categories.map((c) => listProducts(c.id)))).flat();
  return { categories, products };
}

/** Write one event type's configuration to its `pos-config-<name>` spreadsheet. */
export async function syncCatalog(api: GoogleApi, typeId: string): Promise<string> {
  const type = await db.eventTypes.get(typeId);
  if (!type) throw new Error('Type d’évènement introuvable');
  const key = catalogSyncKey(typeId);
  const state = (await db.syncState.get(key)) ?? { key, revision: 0, syncedRevision: 0 };
  const captured = state.revision;
  const name = configFileName(type.name);
  const { categories, products } = await typeCatalog(typeId);

  let id = state.fileId && (await exists(api, state.fileId)) ? state.fileId : null;
  let created = false;
  if (!id) {
    const configs = await listConfigFiles(api);
    const mine = configs.find((f) => f.appProperties?.typeId === typeId);
    const named = configs.find(
      (f) =>
        sameName(f.name, name) ||
        (f.name === S.config && sameName(type.name, fr.types.defaultName)),
    );
    // Never silently overwrite a configuration written by another device.
    if (!mine && named && !state.fileId) throw new ConfigConflictError(named.id, typeId);
    id = mine?.id ?? named?.id ?? null;
    if (!id) {
      id = await createSpreadsheet(api, name, { posApp: 'config', typeId });
      created = true;
    }
  }
  // Renamed type, migrated legacy file or adopted file: follow the type's name and id.
  if (!created && state.syncedName !== name)
    await api.updateFile(id, { name, appProperties: { posApp: 'config', typeId } });

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

  const fileId = id;
  await db.transaction('rw', db.syncState, db.eventTypes, async () => {
    // Deleted while syncing: forget it.
    if (!(await db.eventTypes.get(typeId))) return;
    const cur = (await db.syncState.get(key)) ?? state;
    await db.syncState.put({
      ...cur,
      fileId,
      syncedName: name,
      syncedRevision: Math.max(cur.syncedRevision, captured),
      lastSyncAt: Date.now(),
    });
  });
  return fileId;
}

export interface CatalogImport {
  /** Names of the event types imported, in file order. */
  types: string[];
  /** Number of products imported over all types. */
  products: number;
  problems: ImportProblem[];
}

/**
 * Load every `pos-config-<type>` spreadsheet: each replaces the configuration of the
 * matching type (by id, then by name), or creates the type. Types only on this device
 * are kept. Returns null when the account has no configuration spreadsheet.
 */
export async function importCatalog(api: GoogleApi): Promise<CatalogImport | null> {
  const files = (await listConfigFiles(api)).sort(
    // Files already tied to a type first, so they win over a same-name legacy file.
    (a, b) =>
      Number(!a.appProperties?.typeId) - Number(!b.appProperties?.typeId) ||
      a.name.localeCompare(b.name, 'fr'),
  );
  if (files.length === 0) return null;
  const summary: CatalogImport = { types: [], products: 0, problems: [] };
  const claimed = new Set<string>();

  for (const file of files) {
    const types = await db.eventTypes.toArray();
    const typeName = typeNameOfConfigFile(file.name);
    let type =
      types.find((t) => t.id === file.appProperties?.typeId) ??
      types.find((t) => sameName(t.name, typeName));
    if (type && claimed.has(type.id)) continue;
    if (!type) {
      type = { id: file.appProperties?.typeId ?? newId(), name: typeName, createdAt: Date.now() };
      await db.eventTypes.add(type);
    }
    claimed.add(type.id);

    const sheets = (await api.getSheets(file.id)).sort((a, b) => a.index - b.index);
    const values = await api.readValues(
      file.id,
      sheets.map((sh) => sheetRange(sh.title, 'A1:F')),
    );
    const result = parseConfigTabs(
      sheets.map((sh, i) => ({ title: sh.title, rows: values[i] ?? [] })),
      newId,
      type.id,
    );
    await replaceCatalog(type.id, result.categories, result.products);

    // The device now matches the spreadsheet: nothing to push back, unless the
    // file must be renamed after its type (e.g. legacy `pos-config`).
    const key = catalogSyncKey(type.id);
    const upToDate = file.name === configFileName(type.name);
    await db.transaction('rw', db.syncState, async () => {
      const cur = (await db.syncState.get(key)) ?? { key, revision: 0, syncedRevision: 0 };
      const revision = upToDate ? cur.revision : Math.max(cur.revision, cur.syncedRevision + 1);
      await db.syncState.put({
        ...cur,
        fileId: file.id,
        syncedName: file.name,
        revision,
        syncedRevision: upToDate ? revision : cur.syncedRevision,
        lastSyncAt: Date.now(),
      });
    });

    summary.types.push(type.name);
    summary.products += result.products.length;
    summary.problems.push(
      ...result.problems.map((p) => ({ ...p, sheet: `${file.name} › ${p.sheet}` })),
    );
  }
  return summary;
}

/** The user chose to replace an existing configuration spreadsheet with this device's. */
export async function adoptConfigFile(typeId: string, fileId: string) {
  const key = catalogSyncKey(typeId);
  await db.transaction('rw', db.syncState, async () => {
    const cur = (await db.syncState.get(key)) ?? { key, revision: 0, syncedRevision: 0 };
    await db.syncState.put({
      ...cur,
      fileId,
      syncedName: undefined,
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
  const types = await db.eventTypes.toArray();
  const states = await db.syncState.bulkGet(types.map((t) => catalogSyncKey(t.id)));
  const catalogTypes = types
    .filter((_, i) => {
      const st = states[i];
      return !!st && st.revision > st.syncedRevision;
    })
    .map((t) => t.id);
  const events = (await db.events.toArray()).filter((e) => e.revision > e.syncedRevision);
  return { catalogTypes, events };
}
