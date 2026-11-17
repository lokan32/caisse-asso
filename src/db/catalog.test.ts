import { beforeEach, describe, expect, test } from 'vitest';
import { freshDb } from './testing';
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
import { db } from './db';
import { DEFAULT_COLOR } from '../lib/colors';

beforeEach(async () => {
  await freshDb();
});

const catalogRevision = async () => (await db.syncState.get('catalog'))?.revision ?? 0;

describe('catalog', () => {
  test('create product with defaults', async () => {
    const drinks = await addCategory('Drinks');
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
    const c = await addCategory('Drinks');
    await expect(addProduct({ categoryId: c.id, name: 'X', priceCents: -1 })).rejects.toThrow();
    await expect(addProduct({ categoryId: c.id, name: 'X', priceCents: 1.5 })).rejects.toThrow();
    await expect(addProduct({ categoryId: c.id, name: '  ', priceCents: 100 })).rejects.toThrow();
    await expect(addCategory('')).rejects.toThrow();
  });

  test('repositioning shifts the other products', async () => {
    const c = await addCategory('Drinks');
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
    const c = await addCategory('Drinks');
    const a = await addProduct({ categoryId: c.id, name: 'A', priceCents: 100 });
    await addProduct({ categoryId: c.id, name: 'B', priceCents: 100 });
    await deleteProduct(a.id);
    expect((await listProducts(c.id)).map((p) => [p.name, p.position])).toEqual([['B', 1]]);
  });

  test('moving a product to another category appends it there', async () => {
    const a = await addCategory('A');
    const b = await addCategory('B');
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
    const a = await addCategory('Drinks');
    const b = await addCategory('Food');
    await addProduct({ categoryId: b.id, name: 'Hot dog', priceCents: 300 });
    await renameCategory(a.id, 'Boissons');
    await moveCategory(b.id, -1);
    expect((await listCategories()).map((c) => c.name)).toEqual(['Food', 'Boissons']);
    await deleteCategory(b.id);
    expect((await listCategories()).map((c) => [c.name, c.position])).toEqual([['Boissons', 1]]);
    expect(await db.products.count()).toBe(0);
  });

  test('every change marks the catalog dirty', async () => {
    const before = await catalogRevision();
    const c = await addCategory('Drinks');
    await addProduct({ categoryId: c.id, name: 'A', priceCents: 100 });
    expect(await catalogRevision()).toBe(before + 2);
  });

  test('seed only once and only when empty', async () => {
    expect(await seedIfEmpty()).toBe(true);
    expect((await listCategories()).map((c) => c.name)).toEqual(['Boissons', 'Nourriture']);
    const all = await listCategories();
    for (const c of all) await deleteCategory(c.id);
    expect(await seedIfEmpty()).toBe(false);
    expect(await db.categories.count()).toBe(0);
  });
});
