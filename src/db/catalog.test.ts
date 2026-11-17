import { beforeEach, describe, expect, test } from 'vitest';
import { TEST_TYPE_ID, freshDb } from './testing';
import {
  addCategory,
  addProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  moveCategory,
  moveProduct,
  renameCategory,
  seedIfEmpty,
  updateProduct,
} from './catalog';
import { catalogSyncKey, db } from './db';
import { DEFAULT_COLOR } from '../lib/colors';

beforeEach(async () => {
  await freshDb();
});

const T = TEST_TYPE_ID;
const catalogRevision = async (typeId = T) =>
  (await db.syncState.get(catalogSyncKey(typeId)))?.revision ?? 0;

describe('catalog', () => {
  test('create product with defaults', async () => {
    const drinks = await addCategory(T, 'Drinks');
    await addProduct({ categoryId: drinks.id, name: 'Tea', priceCents: 100 });
    const coffee = await addProduct({ categoryId: drinks.id, name: ' Coffee ', priceCents: 150 });
    expect(coffee).toMatchObject({
      name: 'Coffee',
      costCents: 0,
      color: DEFAULT_COLOR,
      position: 2,
    });
  });

  test('rejects invalid prices and empty names', async () => {
    const c = await addCategory(T, 'Drinks');
    await expect(addProduct({ categoryId: c.id, name: 'X', priceCents: -1 })).rejects.toThrow();
    await expect(addProduct({ categoryId: c.id, name: 'X', priceCents: 1.5 })).rejects.toThrow();
    await expect(addProduct({ categoryId: c.id, name: '  ', priceCents: 100 })).rejects.toThrow();
    await expect(addCategory(T, '')).rejects.toThrow();
  });

  test('repositioning shifts the other products', async () => {
    const c = await addCategory(T, 'Drinks');
    const names = ['A', 'B', 'C', 'D', 'Beer'];
    const created = [];
    for (const n of names)
      created.push(await addProduct({ categoryId: c.id, name: n, priceCents: 100 }));
    await moveProduct(created[4].id, 1);
    expect((await listProducts(c.id)).map((p) => [p.name, p.position])).toEqual([
      ['Beer', 1],
      ['A', 2],
      ['B', 3],
      ['C', 4],
      ['D', 5],
    ]);
    await moveProduct(created[4].id, 3);
    expect((await listProducts(c.id)).map((p) => p.name)).toEqual(['A', 'B', 'Beer', 'C', 'D']);
  });

  test('delete product closes the gap', async () => {
    const c = await addCategory(T, 'Drinks');
    const a = await addProduct({ categoryId: c.id, name: 'A', priceCents: 100 });
    await addProduct({ categoryId: c.id, name: 'B', priceCents: 100 });
    await deleteProduct(a.id);
    expect((await listProducts(c.id)).map((p) => [p.name, p.position])).toEqual([['B', 1]]);
  });

  test('moving a product to another category appends it there', async () => {
    const a = await addCategory(T, 'A');
    const b = await addCategory(T, 'B');
    const p = await addProduct({ categoryId: a.id, name: 'X', priceCents: 100 });
    await addProduct({ categoryId: a.id, name: 'Y', priceCents: 100 });
    await addProduct({ categoryId: b.id, name: 'Z', priceCents: 100 });
    await updateProduct(p.id, { categoryId: b.id });
    expect((await listProducts(b.id)).map((x) => [x.name, x.position])).toEqual([
      ['Z', 1],
      ['X', 2],
    ]);
    expect((await listProducts(a.id)).map((x) => [x.name, x.position])).toEqual([['Y', 1]]);
  });

  test('categories: rename, reorder, delete with products', async () => {
    const a = await addCategory(T, 'Drinks');
    const b = await addCategory(T, 'Food');
    await addProduct({ categoryId: b.id, name: 'Hot dog', priceCents: 300 });
    await renameCategory(a.id, 'Boissons');
    await moveCategory(b.id, -1);
    expect((await listCategories(T)).map((c) => c.name)).toEqual(['Food', 'Boissons']);
    await deleteCategory(b.id);
    expect((await listCategories(T)).map((c) => [c.name, c.position])).toEqual([['Boissons', 1]]);
    expect(await db.products.count()).toBe(0);
  });

  test('every change marks the catalog dirty', async () => {
    const before = await catalogRevision();
    const c = await addCategory(T, 'Drinks');
    await addProduct({ categoryId: c.id, name: 'A', priceCents: 100 });
    expect(await catalogRevision()).toBe(before + 2);
  });

  test('seed creates the "Général" type once, only when there is no type', async () => {
    await db.eventTypes.clear();
    expect(await seedIfEmpty()).toBe(true);
    const types = await db.eventTypes.toArray();
    expect(types.map((t) => t.name)).toEqual(['Général']);
    const all = await listCategories(types[0].id);
    expect(all.map((c) => c.name)).toEqual(['Boissons', 'Nourriture']);
    for (const c of all) await deleteCategory(c.id);
    expect(await seedIfEmpty()).toBe(false);
    expect(await db.categories.count()).toBe(0);
    expect(await db.eventTypes.count()).toBe(1);
  });

  test('seed does nothing when a type already exists', async () => {
    expect(await seedIfEmpty()).toBe(false);
    expect(await db.categories.count()).toBe(0);
  });

  test('two event types have independent catalogs', async () => {
    await db.eventTypes.add({ id: 'other', name: 'Kermesse', createdAt: 1 });
    const a = await addCategory(T, 'Boissons');
    const b = await addCategory('other', 'Boissons');
    await addCategory('other', 'Snacks');
    const coffeeA = await addProduct({ categoryId: a.id, name: 'Café', priceCents: 150 });
    await addProduct({ categoryId: b.id, name: 'Café', priceCents: 150 });
    const before = await catalogRevision('other');
    await updateProduct(coffeeA.id, { priceCents: 200 });
    expect((await listProducts(b.id))[0].priceCents).toBe(150);
    expect(await catalogRevision('other')).toBe(before);
    expect((await listCategories(T)).map((c) => [c.name, c.position])).toEqual([['Boissons', 1]]);
    expect((await listCategories('other')).map((c) => [c.name, c.position])).toEqual([
      ['Boissons', 1],
      ['Snacks', 2],
    ]);
    await moveCategory(b.id, 1);
    expect((await listCategories('other')).map((c) => c.name)).toEqual(['Snacks', 'Boissons']);
    expect((await listCategories(T)).map((c) => c.name)).toEqual(['Boissons']);
  });
});
