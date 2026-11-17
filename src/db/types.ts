export interface EventType {
  id: string;
  name: string;
  createdAt: number;
}

export interface Category {
  id: string;
  /** Event type owning this category (and its products). */
  typeId: string;
  name: string;
  position: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  priceCents: number;
  costCents: number;
  color: string;
  position: number;
}

export type EventStatus = 'open' | 'closed';

export interface PosEvent {
  id: string;
  /** Event type chosen at start; may point to a deleted type. */
  typeId: string;
  /** Local date YYYY-MM-DD. */
  startDate: string;
  label: string;
  floatCents: number;
  status: EventStatus;
  createdAt: number;
  closedAt?: number;
  /** Next order number to assign. */
  nextSeq: number;
  /** Incremented on every change to the event or its orders. */
  revision: number;
  /** Revision that was last written to the spreadsheet successfully. */
  syncedRevision: number;
  spreadsheetId?: string;
  spreadsheetName?: string;
  lastSyncAt?: number;
}

export interface OrderLine {
  productId: string;
  name: string;
  category: string;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number;
}

export type OrderStatus = 'ok' | 'modified' | 'voided';

export interface Order {
  id: string;
  eventId: string;
  seq: number;
  createdAt: number;
  updatedAt?: number;
  status: OrderStatus;
  lines: OrderLine[];
  totalCents: number;
  costCents: number;
  receivedCents?: number;
  /** Event revision at this order's last change (pending sync when > event.syncedRevision). */
  revision: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface SyncState {
  key: string;
  revision: number;
  syncedRevision: number;
  fileId?: string;
  /** Spreadsheet name last written to Drive (config spreadsheets). */
  syncedName?: string;
  lastSyncAt?: number;
}
