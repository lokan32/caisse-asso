import { catalogSyncKey, db, newId } from './db';
import type { Category, Product } from './types';
import { DEFAULT_COLOR } from '../lib/colors';
import { fr } from '../i18n/fr';

/** Record that a type's configuration changed and must be written to its spreadsheet. */
export async function markCatalogDirty(typeId: string) {
  const key = catalogSyncKey(typeId);
  await db.transaction('rw', db.syncState, async () => {
    const s = (await db.syncState.get(key)) ?? { key, revision: 0, syncedRevision: 0 };
    await db.syncState.put({ ...s, revision: s.revision + 1 });
  });
}

/** Categories of one event type, in order. */
export async function listCategories(typeId: string): Promise<Category[]> {
  return db.categories
    .where('[typeId+position]')
    .between([typeId, -Infinity], [typeId, Infinity])
    .toArray();
}

export async function listProducts(categoryId: string): Promise<Product[]> {
  return db.products
    .where('[categoryId+position]')
    .between([categoryId, -Infinity], [categoryId, Infinity])
    .toArray();
}

/** Event type owning a product (through its category). */
async function typeOfCategory(categoryId: string): Promise<string> {
  const c = await db.categories.get(categoryId);
  if (!c) throw new Error('Catégorie introuvable');
  return c.typeId;
}

export async function addCategory(typeId: string, name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(fr.edit.nameRequired);
  const cat = await db.transaction('rw', db.categories, async () => {
    const existing = await listCategories(typeId);
    const last = existing[existing.length - 1];
    const c: Category = { id: newId(), typeId, name: trimmed, position: (last?.position ?? 0) + 1 };
    await db.categories.add(c);
    return c;
  });
  await markCatalogDirty(typeId);
  return cat;
}

export async function renameCategory(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(fr.edit.nameRequired);
  await db.categories.update(id, { name: trimmed });
  await markCatalogDirty(await typeOfCategory(id));
}

/** Move a category one step earlier (-1) or later (+1) within its type. */
export async function moveCategory(id: string, delta: -1 | 1) {
  const typeId = await typeOfCategory(id);
  await db.transaction('rw', db.categories, async () => {
    const cats = await listCategories(typeId);
    const i = cats.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    await Promise.all(cats.map((c, k) => db.categories.update(c.id, { position: k + 1 })));
  });
  await markCatalogDirty(typeId);
}

/** Delete a category and all its products (callers confirm first when non-empty). */
export async function deleteCategory(id: string) {
  const typeId = await typeOfCategory(id);
  await db.transaction('rw', db.categories, db.products, async () => {
    await db.products.where({ categoryId: id }).delete();
    await db.categories.delete(id);
    const cats = await listCategories(typeId);
    await Promise.all(cats.map((c, k) => db.categories.update(c.id, { position: k + 1 })));
  });
  await markCatalogDirty(typeId);
}

export interface ProductInput {
  categoryId: string;
  name: string;
  priceCents: number;
  costCents?: number;
  color?: string;
}

export function validateProduct(p: {
  name: string;
  priceCents: number | null;
  costCents?: number | null;
}) {
  const errors: { name?: string; price?: string; cost?: string } = {};
  if (!p.name.trim()) errors.name = fr.edit.nameRequired;
  if (p.priceCents === null || !Number.isInteger(p.priceCents) || p.priceCents < 0)
    errors.price = fr.edit.invalidPrice;
  if (
    p.costCents === null ||
    (p.costCents !== undefined && (!Number.isInteger(p.costCents) || p.costCents < 0))
  )
    errors.cost = fr.edit.invalidPrice;
  return errors;
}

export async function addProduct(input: ProductInput): Promise<Product> {
  const errors = validateProduct(input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(', '));
  const product = await db.transaction('rw', db.products, async () => {
    const existing = await listProducts(input.categoryId);
    const p: Product = {
      id: newId(),
      categoryId: input.categoryId,
      name: input.name.trim(),
      priceCents: input.priceCents,
      costCents: input.costCents ?? 0,
      color: input.color ?? DEFAULT_COLOR,
      position: existing.length + 1,
    };
    await db.products.add(p);
    return p;
  });
  await markCatalogDirty(await typeOfCategory(input.categoryId));
  return product;
}

export async function updateProduct(id: string, patch: Partial<Omit<Product, 'id' | 'position'>>) {
  const current = await db.products.get(id);
  if (!current) return;
  const next = { ...current, ...patch, name: (patch.name ?? current.name).trim() };
  const errors = validateProduct(next);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(', '));
  await db.transaction('rw', db.products, async () => {
    if (patch.categoryId && patch.categoryId !== current.categoryId) {
      // Moving to another category: append at the end there, close the gap here.
      const target = await listProducts(patch.categoryId);
      await db.products.put({ ...next, position: target.length + 1 });
      await renumber(current.categoryId);
    } else {
      await db.products.put({ ...next, position: current.position });
    }
  });
  await markCatalogDirty(await typeOfCategory(current.categoryId));
}

export async function deleteProduct(id: string) {
  const p = await db.products.get(id);
  if (!p) return;
  await db.transaction('rw', db.products, async () => {
    await db.products.delete(id);
    await renumber(p.categoryId);
  });
  await markCatalogDirty(await typeOfCategory(p.categoryId));
}

/** Move a product to a 1-based position in its category, shifting the others. */
export async function moveProduct(id: string, newPosition: number) {
  const p = await db.products.get(id);
  if (!p) return;
  await db.transaction('rw', db.products, async () => {
    const list = (await listProducts(p.categoryId)).filter((x) => x.id !== id);
    const index = Math.max(0, Math.min(list.length, newPosition - 1));
    list.splice(index, 0, p);
    await Promise.all(list.map((x, k) => db.products.update(x.id, { position: k + 1 })));
  });
  await markCatalogDirty(await typeOfCategory(p.categoryId));
}

async function renumber(categoryId: string) {
  const list = await listProducts(categoryId);
  await Promise.all(
    list.map((x, k) =>
      x.position === k + 1 ? null : db.products.update(x.id, { position: k + 1 }),
    ),
  );
}

/** Replace one event type's configuration (import from its spreadsheet). */
export async function replaceCatalog(typeId: string, categories: Category[], products: Product[]) {
  await db.transaction('rw', db.categories, db.products, async () => {
    await deleteTypeCatalog(typeId);
    await db.categories.bulkAdd(categories.map((c) => ({ ...c, typeId })));
    await db.products.bulkAdd(products);
  });
}

/** Remove every category and product of a type (inside a caller's transaction). */
export async function deleteTypeCatalog(typeId: string) {
  const cats = await listCategories(typeId);
  const ids = cats.map((c) => c.id);
  await db.products.where('categoryId').anyOf(ids).delete();
  await db.categories.bulkDelete(ids);
}

/** Copy every category and product of `fromTypeId` into `toTypeId`, with fresh ids. */
export async function copyCatalog(fromTypeId: string, toTypeId: string) {
  await db.transaction('rw', db.categories, db.products, async () => {
    for (const c of await listCategories(fromTypeId)) {
      const copy: Category = { ...c, id: newId(), typeId: toTypeId };
      await db.categories.add(copy);
      const products = await listProducts(c.id);
      await db.products.bulkAdd(products.map((p) => ({ ...p, id: newId(), categoryId: copy.id })));
    }
  });
}

/**
 * First launch: create the "Général" event type with an example catalog so the grid
 * isn't empty; the user can change or delete it.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const seeded = await db.settings.get('seeded');
  if (seeded) return false;
  await db.settings.put({ key: 'seeded', value: true });
  if ((await db.eventTypes.count()) > 0) return false;
  const typeId = newId();
  await db.eventTypes.add({ id: typeId, name: fr.types.defaultName, createdAt: Date.now() });
  const drinks = await addCategory(typeId, fr.seed.drinks);
  const food = await addCategory(typeId, fr.seed.food);
  const cats = [drinks, food];
  for (const p of fr.seed.products) {
    await addProduct({
      categoryId: cats[p.cat].id,
      name: p.name,
      priceCents: p.price,
      costCents: p.cost,
      color: p.color,
    });
  }
  return true;
}
