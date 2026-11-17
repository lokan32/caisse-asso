import 'fake-indexeddb/auto';
import { PosDb, useDatabase } from './db';

let counter = 0;

/** Event type created in every fresh test database. */
export const TEST_TYPE_ID = 'type-test';

/** Give each test its own database holding one event type ("Général", id TEST_TYPE_ID). */
export async function freshDb(): Promise<PosDb> {
  const d = new PosDb(`test-${Date.now()}-${counter++}`);
  await d.open();
  await d.eventTypes.add({ id: TEST_TYPE_ID, name: 'Général', createdAt: 0 });
  useDatabase(d);
  return d;
}
