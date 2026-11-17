import Dexie, { type EntityTable } from 'dexie';
import type { Category, EventType, Order, PosEvent, Product, Setting, SyncState } from './types';
import { fr } from '../i18n/fr';

/** Sync state key of an event type's configuration spreadsheet. */
export const catalogSyncKey = (typeId: string) => `catalog:${typeId}`;

export class PosDb extends Dexie {
  eventTypes!: EntityTable<EventType, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  products!: EntityTable<Product, 'id'>;
  events!: EntityTable<PosEvent, 'id'>;
  orders!: EntityTable<Order, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  syncState!: EntityTable<SyncState, 'key'>;

  constructor(name = 'caisse-asso') {
    super(name);
    // Bump the version and add an upgrade() when the schema changes.
    this.version(1).stores({
      categories: 'id, position',
      products: 'id, categoryId, [categoryId+position]',
      events: 'id, status, startDate',
      orders: 'id, eventId, [eventId+seq], [eventId+revision]',
      settings: 'key',
      syncState: 'key',
    });
    // v2: event types. The existing catalog and events become the "Général" type.
    this.version(2)
      .stores({
        eventTypes: 'id, name',
        categories: 'id, [typeId+position]',
        events: 'id, status, startDate, typeId',
      })
      .upgrade(async (tx) => {
        const typeId = newId();
        await tx
          .table('eventTypes')
          .add({ id: typeId, name: fr.types.defaultName, createdAt: Date.now() });
        await tx.table('categories').toCollection().modify({ typeId });
        await tx.table('events').toCollection().modify({ typeId });
        const legacy = await tx.table('syncState').get('catalog');
        if (legacy) {
          // Bump the revision so the next sync renames the file and tags it with the type.
          await tx.table('syncState').put({
            ...legacy,
            key: catalogSyncKey(typeId),
            revision: Math.max(legacy.revision, legacy.syncedRevision + 1),
          });
          await tx.table('syncState').delete('catalog');
        }
      });
  }
}

export let db = new PosDb();

/** Tests use a fresh database per test. */
export function useDatabase(newDb: PosDb) {
  db = newDb;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
