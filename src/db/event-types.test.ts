import { beforeEach, describe, expect, test } from 'vitest';
import { TEST_TYPE_ID, freshDb } from './testing';
import { catalogSyncKey, db } from './db';
import {
  createEventType,
  defaultTypeId,
  deleteEventType,
  EventTypeInUseError,
  listEventTypes,
  renameEventType,
  typeName,
} from './event-types';
import { addCategory, addProduct, deleteProduct, listCategories, listProducts } from './catalog';
import { closeEvent, startEvent } from './events';

beforeEach(async () => {
  await freshDb();
});

async function kermesse() {
  const type = await createEventType('Kermesse');
  const drinks = await addCategory(type.id, 'Boissons');
  const snacks = await addCategory(type.id, 'Snacks');
  await addProduct({ categoryId: drinks.id, name: 'Café', priceCents: 150, costCents: 30 });
  await addProduct({ categoryId: drinks.id, name: 'Soda', priceCents: 200, color: '#E53935' });
  await addProduct({ categoryId: snacks.id, name: 'Barbe à papa', priceCents: 300 });
  return type;
}

/** Snapshot of a type's configuration without ids. */
async function configOf(typeId: string) {
  const cats = await listCategories(typeId);
  return Promise.all(
    cats.map(async (c) => ({
      name: c.name,
      position: c.position,
      products: (await listProducts(c.id)).map((p) => [
        p.name,
        p.priceCents,
        p.costCents,
        p.color,
        p.position,
      ]),
    })),
  );
}

describe('event types', () => {
  test('create an empty type', async () => {
    const loto = await createEventType(' Loto ');
    expect(loto.name).toBe('Loto');
    expect(await listCategories(loto.id)).toEqual([]);
    expect((await listEventTypes()).map((t) => t.name)).toEqual(['Général', 'Loto']);
  });

  test('names are mandatory and unique, case-insensitively', async () => {
    await createEventType('Kermesse');
    await expect(createEventType('kermesse')).rejects.toThrow('Ce nom est déjà utilisé');
    await expect(createEventType('  ')).rejects.toThrow();
    const loto = await createEventType('Loto');
    await expect(renameEventType(loto.id, 'KERMESSE')).rejects.toThrow('Ce nom est déjà utilisé');
    await renameEventType(loto.id, 'loto'); // own name, other case: allowed
    expect((await db.eventTypes.get(loto.id))?.name).toBe('loto');
  });

  test('create from an existing configuration copies everything', async () => {
    const k = await kermesse();
    const copy = await createEventType('Kermesse 2027', k.id);
    expect(await configOf(copy.id)).toEqual(await configOf(k.id));
    const ids = (await db.products.toArray()).map((p) => p.id);
    expect(new Set(ids).size).toBe(6);
  });

  test('the copy is independent of its source', async () => {
    const k = await kermesse();
    const copy = await createEventType('Kermesse 2027', k.id);
    const [, snacks] = await listCategories(copy.id);
    await deleteProduct((await listProducts(snacks.id))[0].id);
    const [, srcSnacks] = await listCategories(k.id);
    expect((await listProducts(srcSnacks.id)).map((p) => p.name)).toEqual(['Barbe à papa']);
  });

  test('rename marks the configuration for sync', async () => {
    const k = await kermesse();
    const before = (await db.syncState.get(catalogSyncKey(k.id)))!.revision;
    await renameEventType(k.id, "Kermesse de l'école");
    expect((await db.eventTypes.get(k.id))?.name).toBe("Kermesse de l'école");
    expect((await db.syncState.get(catalogSyncKey(k.id)))!.revision).toBe(before + 1);
  });

  test('deleting a type used by an open event is refused', async () => {
    const k = await kermesse();
    await startEvent({ typeId: k.id });
    await expect(deleteEventType(k.id)).rejects.toBeInstanceOf(EventTypeInUseError);
    expect(await db.eventTypes.get(k.id)).toBeDefined();
  });

  test('deleting a type used only by closed events keeps the events', async () => {
    const k = await kermesse();
    const e = await startEvent({ typeId: k.id });
    await closeEvent(e.id);
    await deleteEventType(k.id);
    expect(await db.eventTypes.get(k.id)).toBeUndefined();
    expect(await db.categories.count()).toBe(0);
    expect(await db.products.count()).toBe(0);
    expect(await db.syncState.get(catalogSyncKey(k.id))).toBeUndefined();
    expect((await db.events.get(e.id))?.typeId).toBe(k.id);
    expect(typeName(await listEventTypes(), k.id)).toBe('Type supprimé');
  });

  test('the last type cannot be deleted', async () => {
    await expect(deleteEventType(TEST_TYPE_ID)).rejects.toThrow('au moins un type');
  });

  test('default type is the type of the most recently started event', async () => {
    expect(await defaultTypeId()).toBe(TEST_TYPE_ID);
    const k = await kermesse();
    const first = await startEvent({ typeId: k.id });
    expect(await defaultTypeId()).toBe(k.id);
    const second = await startEvent({ typeId: TEST_TYPE_ID });
    await db.events.update(second.id, { createdAt: first.createdAt + 1 });
    expect(await defaultTypeId()).toBe(TEST_TYPE_ID);
  });
});
