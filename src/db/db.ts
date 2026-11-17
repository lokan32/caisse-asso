import Dexie, { type EntityTable } from 'dexie';
import type { Category, Order, PosEvent, Product, Setting, SyncState } from './types';

export class PosDb extends Dexie {
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
