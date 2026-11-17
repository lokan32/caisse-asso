import 'fake-indexeddb/auto';
import { PosDb, useDatabase } from './db';

let counter = 0;

/** Give each test its own empty database. */
export async function freshDb(): Promise<PosDb> {
  const d = new PosDb(`test-${Date.now()}-${counter++}`);
  await d.open();
  useDatabase(d);
  return d;
}
