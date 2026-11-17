import { beforeEach, describe, expect, test } from 'vitest';
import { freshDb } from './testing';
import {
  activateEvent,
  closeEvent,
  eventDisplayName,
  getActiveEvent,
  listEvents,
  startEvent,
  uniqueSpreadsheetName,
} from './events';
import { db } from './db';

beforeEach(async () => {
  await freshDb();
});

describe('events', () => {
  test('no active event initially', async () => {
    expect(await getActiveEvent()).toBeNull();
  });

  test('start makes the event active', async () => {
    const e = await startEvent({
      startDate: '2026-11-21',
      label: 'Christmas market',
      floatCents: 5000,
    });
    expect(await getActiveEvent()).toMatchObject({
      id: e.id,
      label: 'Christmas market',
      floatCents: 5000,
      status: 'open',
    });
    expect(eventDisplayName(e)).toBe('Christmas market (21/11/2026)');
    expect(eventDisplayName({ label: '', startDate: '2026-11-21' })).toBe(
      'Évènement du 21/11/2026',
    );
  });

  test('starting another event keeps the previous one open but inactive', async () => {
    const a = await startEvent({ startDate: '2026-11-21' });
    const b = await startEvent({ startDate: '2026-11-22' });
    expect((await getActiveEvent())?.id).toBe(b.id);
    expect((await db.events.get(a.id))?.status).toBe('open');
    expect((await listEvents()).map((e) => e.id)).toEqual([b.id, a.id]);
  });

  test('switch back to an open event (multi-day)', async () => {
    const a = await startEvent({ startDate: '2026-11-21' });
    await startEvent({ startDate: '2026-11-22' });
    await activateEvent(a.id);
    expect((await getActiveEvent())?.id).toBe(a.id);
  });

  test('closing makes it read-only and inactive, and needs a final sync', async () => {
    const a = await startEvent({ startDate: '2026-11-21' });
    await closeEvent(a.id);
    const closed = await db.events.get(a.id);
    expect(closed?.status).toBe('closed');
    expect(closed!.revision).toBeGreaterThan(closed!.syncedRevision);
    expect(await getActiveEvent()).toBeNull();
    await expect(activateEvent(a.id)).rejects.toThrow();
  });

  test('spreadsheet name gets a numeric suffix when taken', () => {
    expect(uniqueSpreadsheetName('event-2026-11-21', [])).toBe('event-2026-11-21');
    expect(uniqueSpreadsheetName('event-2026-11-21', ['event-2026-11-21'])).toBe(
      'event-2026-11-21-2',
    );
    expect(
      uniqueSpreadsheetName('event-2026-11-21', ['event-2026-11-21', 'event-2026-11-21-2']),
    ).toBe('event-2026-11-21-3');
  });
});
