import { catalogSyncKey, db, newId } from './db';
import type { EventType } from './types';
import { copyCatalog, deleteTypeCatalog, markCatalogDirty } from './catalog';
import { fr } from '../i18n/fr';

export class EventTypeInUseError extends Error {
  constructor(name: string) {
    super(fr.types.inUse(name));
  }
}

/** Sorted by name. */
export async function listEventTypes(): Promise<EventType[]> {
  const all = await db.eventTypes.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function validateName(name: string, exceptId?: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(fr.edit.nameRequired);
  const lower = trimmed.toLocaleLowerCase('fr');
  const all = await db.eventTypes.toArray();
  if (all.some((t) => t.id !== exceptId && t.name.toLocaleLowerCase('fr') === lower))
    throw new Error(fr.types.duplicateName);
  return trimmed;
}

/** Create a type, empty or with an independent copy of `sourceTypeId`'s configuration. */
export async function createEventType(name: string, sourceTypeId?: string): Promise<EventType> {
  const type: EventType = { id: newId(), name: await validateName(name), createdAt: Date.now() };
  await db.eventTypes.add(type);
  if (sourceTypeId) await copyCatalog(sourceTypeId, type.id);
  await markCatalogDirty(type.id);
  return type;
}

export async function renameEventType(id: string, name: string) {
  const trimmed = await validateName(name, id);
  await db.eventTypes.update(id, { name: trimmed });
  // The configuration spreadsheet is renamed at the next sync.
  await markCatalogDirty(id);
}

/** Delete a type and its configuration. Refused while an open event uses it, or for the last type. */
export async function deleteEventType(id: string) {
  const type = await db.eventTypes.get(id);
  if (!type) return;
  if ((await db.eventTypes.count()) <= 1) throw new Error(fr.types.lastType);
  const openUsing = await db.events
    .where('typeId')
    .equals(id)
    .filter((e) => e.status === 'open')
    .count();
  if (openUsing > 0) throw new EventTypeInUseError(type.name);
  await db.transaction('rw', db.eventTypes, db.categories, db.products, db.syncState, async () => {
    await deleteTypeCatalog(id);
    await db.eventTypes.delete(id);
    // Its spreadsheet is left in Drive and no longer updated.
    await db.syncState.delete(catalogSyncKey(id));
  });
}

/** Type of the most recently started event if it still exists, else the first type by name. */
export async function defaultTypeId(): Promise<string | null> {
  const events = await db.events.toArray();
  const recent = events.reduce<(typeof events)[number] | undefined>(
    (best, e) => (!best || e.createdAt > best.createdAt ? e : best),
    undefined,
  );
  if (recent && (await db.eventTypes.get(recent.typeId))) return recent.typeId;
  return (await listEventTypes())[0]?.id ?? null;
}

/** Name of a type, or "Type supprimé" when it no longer exists. */
export function typeName(types: EventType[], id: string): string {
  return types.find((t) => t.id === id)?.name ?? fr.types.deleted;
}
