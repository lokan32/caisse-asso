import { db, newId } from './db';
import type { PosEvent } from './types';
import { getSettings, setSetting } from './settings';
import { formatIsoDate, isoDate } from '../lib/dates';

export class EventClosedError extends Error {
  constructor() {
    super('Évènement clôturé');
  }
}

export interface StartEventInput {
  startDate?: string;
  label?: string;
  floatCents?: number;
}

/** Start a new event and make it the active one. Any previous active event stays open. */
export async function startEvent(input: StartEventInput = {}): Promise<PosEvent> {
  const startDate = input.startDate ?? isoDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Date invalide');
  const event: PosEvent = {
    id: newId(),
    startDate,
    label: (input.label ?? '').trim(),
    floatCents: input.floatCents ?? 0,
    status: 'open',
    createdAt: Date.now(),
    nextSeq: 1,
    revision: 1,
    syncedRevision: 0,
  };
  await db.transaction('rw', db.events, db.settings, async () => {
    await db.events.add(event);
    await setSetting('activeEventId', event.id);
  });
  return event;
}

export async function getActiveEvent(): Promise<PosEvent | null> {
  const { activeEventId } = await getSettings();
  if (!activeEventId) return null;
  const e = await db.events.get(activeEventId);
  return e && e.status === 'open' ? e : null;
}

/** Resume a previously started event that is still open. */
export async function activateEvent(id: string) {
  const e = await db.events.get(id);
  if (!e) throw new Error('Évènement introuvable');
  if (e.status === 'closed') throw new EventClosedError();
  await setSetting('activeEventId', id);
}

/** Close an event: read-only from now on; its data still needs a final sync. */
export async function closeEvent(id: string) {
  await db.transaction('rw', db.events, db.settings, async () => {
    const e = await db.events.get(id);
    if (!e || e.status === 'closed') return;
    await db.events.update(id, {
      status: 'closed',
      closedAt: Date.now(),
      revision: e.revision + 1,
    });
    const { activeEventId } = await getSettings();
    if (activeEventId === id) await setSetting('activeEventId', null);
  });
}

/** Newest first. */
export async function listEvents(): Promise<PosEvent[]> {
  const all = await db.events.toArray();
  return all.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt);
}

export function eventDisplayName(e: Pick<PosEvent, 'label' | 'startDate'>): string {
  const date = formatIsoDate(e.startDate);
  return e.label ? `${e.label} (${date})` : `Évènement du ${date}`;
}

export function baseSpreadsheetName(e: Pick<PosEvent, 'startDate'>): string {
  return `event-${e.startDate}`;
}

/** event-2026-11-21, then event-2026-11-21-2, -3… if the name is taken. */
export function uniqueSpreadsheetName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Throws if the event can no longer be changed. */
export async function assertEventOpen(eventId: string): Promise<PosEvent> {
  const e = await db.events.get(eventId);
  if (!e) throw new Error('Évènement introuvable');
  if (e.status === 'closed') throw new EventClosedError();
  return e;
}
