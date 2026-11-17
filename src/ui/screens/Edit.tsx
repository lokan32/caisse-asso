import { useEffect, useState } from 'preact/hooks';
import { fr } from '../../i18n/fr';
import { Icon } from '../Icon';
import { Layout } from '../Layout';
import { useLiveQuery, useSettings } from '../hooks';
import { db } from '../../db/db';
import type { Category, EventType, Product } from '../../db/types';
import { defaultTypeId, listEventTypes } from '../../db/event-types';
import { navigate, useRoute } from '../router';
import { useActiveEvent } from '../useActiveEvent';
import {
  addCategory,
  addProduct,
  deleteCategory,
  listCategories,
  deleteProduct,
  moveCategory,
  moveProduct,
  renameCategory,
  updateProduct,
  validateProduct,
} from '../../db/catalog';
import { CategoryTabs, ProductButton } from '../ProductButton';
import { Dialog, confirmDialog } from '../components';
import { PALETTE, DEFAULT_COLOR } from '../../lib/colors';
import { centsToInput, parseAmount } from '../../lib/money';

/** Type being edited: `?type=` in the route, else the active event's type, else the default type. */
function useEditedType(): string | null {
  const route = useRoute();
  const active = useActiveEvent();
  const fallback = useLiveQuery(defaultTypeId, [], null as string | null);
  return route.query.get('type') ?? (active ? active.typeId : fallback);
}

export function EditScreen() {
  const settings = useSettings();
  const typeId = useEditedType();
  const types = useLiveQuery(listEventTypes, [], [] as EventType[]);
  const categories = useLiveQuery(
    () => (typeId ? listCategories(typeId) : []),
    [typeId],
    [] as Category[],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<'new' | 'rename' | null>(null);

  useEffect(() => {
    if (!categories.find((c) => c.id === selected)) setSelected(categories[0]?.id ?? null);
  }, [categories, selected]);

  const products = useLiveQuery(
    () =>
      selected
        ? db.products
            .where('[categoryId+position]')
            .between([selected, -Infinity], [selected, Infinity])
            .toArray()
        : [],
    [selected],
    [] as Product[],
  );
  const category = categories.find((c) => c.id === selected) ?? null;

  const onDeleteCategory = async () => {
    if (!category) return;
    const ok =
      products.length === 0 ||
      (await confirmDialog(fr.edit.deleteCategoryConfirm(category.name, products.length), {
        confirmLabel: fr.delete,
        danger: true,
      }));
    if (ok) await deleteCategory(category.id);
  };

  return (
    <Layout title={fr.edit.title}>
      <div class="field">
        <label for="edit-type">{fr.types.type}</label>
        <select
          id="edit-type"
          value={typeId ?? ''}
          onChange={(e) => navigate(`/edit?type=${e.currentTarget.value}`)}
          data-testid="edit-type"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <CategoryTabs
        categories={categories}
        selected={selected}
        onSelect={setSelected}
        extra={
          <button class="tab" onClick={() => setCategoryDialog('new')} data-testid="add-category">
            + {fr.edit.addCategory}
          </button>
        }
      />
      {category && (
        <>
          <div class="row" style={{ marginBottom: '10px' }}>
            <button
              class="btn"
              onClick={() => setCategoryDialog('rename')}
              data-testid="rename-category"
            >
              <Icon name="pencil" size={18} /> {fr.edit.renameCategory}
            </button>
            <button
              class="btn"
              onClick={() => moveCategory(category.id, -1)}
              aria-label={fr.edit.moveLeft}
            >
              ◀
            </button>
            <button
              class="btn"
              onClick={() => moveCategory(category.id, 1)}
              aria-label={fr.edit.moveRight}
            >
              ▶
            </button>
            <button class="btn danger" onClick={onDeleteCategory} data-testid="delete-category">
              <Icon name="trash" size={18} /> {fr.edit.deleteCategory}
            </button>
          </div>
          <p class="muted">{fr.edit.hint}</p>
          <div class="product-grid" data-testid="edit-grid">
            {products.map((p) => (
              <div key={p.id}>
                <ProductButton
                  product={p}
                  currency={settings.currency}
                  onClick={() => setEditing(p)}
                />
                <div class="edit-tile-actions">
                  <button
                    onClick={() => moveProduct(p.id, p.position - 1)}
                    disabled={p.position === 1}
                    aria-label={`${fr.edit.moveLeft} ${p.name}`}
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => moveProduct(p.id, p.position + 1)}
                    disabled={p.position === products.length}
                    aria-label={`${fr.edit.moveRight} ${p.name}`}
                  >
                    ▶
                  </button>
                </div>
              </div>
            ))}
            <button
              class="product-btn"
              style={{ background: '#fff', border: '2px dashed #9ca3af' }}
              onClick={() => setEditing('new')}
              data-testid="add-product"
            >
              + {fr.edit.addProduct}
            </button>
          </div>
        </>
      )}
      {!category && <p class="muted">{fr.order.noCategories}</p>}

      {categoryDialog && (
        <CategoryDialog
          initial={categoryDialog === 'rename' ? (category?.name ?? '') : ''}
          title={categoryDialog === 'rename' ? fr.edit.renameCategory : fr.edit.addCategory}
          onClose={() => setCategoryDialog(null)}
          onSave={async (name) => {
            if (categoryDialog === 'rename' && category) await renameCategory(category.id, name);
            else if (typeId) setSelected((await addCategory(typeId, name)).id);
            setCategoryDialog(null);
          }}
        />
      )}
      {editing && category && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          categoryId={category.id}
          categories={categories}
          count={products.length}
          onClose={() => setEditing(null)}
        />
      )}
    </Layout>
  );
}

function CategoryDialog(props: {
  initial: string;
  title: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(props.initial);
  const [error, setError] = useState('');
  return (
    <Dialog title={props.title} onClose={props.onClose} testId="category-dialog">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setError(fr.edit.nameRequired);
          await props.onSave(name);
        }}
      >
        <div class="field">
          <label for="cat-name">{fr.edit.categoryName}</label>
          <input
            id="cat-name"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoFocus
            aria-invalid={!!error}
          />
          {error && <span class="error">{error}</span>}
        </div>
        <div class="row end">
          <button type="button" class="btn" onClick={props.onClose}>
            {fr.cancel}
          </button>
          <button type="submit" class="btn primary">
            {fr.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ProductDialog(props: {
  product: Product | null;
  categoryId: string;
  categories: Category[];
  count: number;
  onClose: () => void;
}) {
  const p = props.product;
  const [name, setName] = useState(p?.name ?? '');
  const [price, setPrice] = useState(p ? centsToInput(p.priceCents) : '');
  const [cost, setCost] = useState(p ? centsToInput(p.costCents) : '');
  const [color, setColor] = useState(p?.color ?? DEFAULT_COLOR);
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? props.categoryId);
  const [position, setPosition] = useState(String(p?.position ?? props.count + 1));
  const [errors, setErrors] = useState<{ name?: string; price?: string; cost?: string }>({});

  const save = async (e: Event) => {
    e.preventDefault();
    const priceCents = parseAmount(price);
    const costCents = cost.trim() === '' ? 0 : parseAmount(cost);
    const errs = validateProduct({ name, priceCents, costCents });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (p) {
      await updateProduct(p.id, {
        name,
        priceCents: priceCents!,
        costCents: costCents!,
        color,
        categoryId,
      });
      const pos = parseInt(position, 10);
      if (categoryId === p.categoryId && Number.isFinite(pos) && pos !== p.position)
        await moveProduct(p.id, pos);
    } else {
      const created = await addProduct({
        categoryId,
        name,
        priceCents: priceCents!,
        costCents: costCents!,
        color,
      });
      const pos = parseInt(position, 10);
      if (Number.isFinite(pos) && pos !== created.position) await moveProduct(created.id, pos);
    }
    props.onClose();
  };

  const remove = async () => {
    if (
      p &&
      (await confirmDialog(fr.edit.deleteProductConfirm(p.name), {
        confirmLabel: fr.delete,
        danger: true,
      }))
    ) {
      await deleteProduct(p.id);
      props.onClose();
    }
  };

  return (
    <Dialog
      title={p ? fr.edit.editProduct : fr.edit.addProduct}
      onClose={props.onClose}
      testId="product-dialog"
    >
      <form onSubmit={save} noValidate>
        <div class="field">
          <label for="p-name">{fr.edit.name}</label>
          <input
            id="p-name"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            aria-invalid={!!errors.name}
          />
          {errors.name && <span class="error">{errors.name}</span>}
        </div>
        <div class="row" style={{ alignItems: 'flex-start' }}>
          <div class="field" style={{ flex: 1 }}>
            <label for="p-price">{fr.edit.salePrice}</label>
            <input
              id="p-price"
              inputMode="decimal"
              value={price}
              onInput={(e) => setPrice(e.currentTarget.value)}
              aria-invalid={!!errors.price}
            />
            {errors.price && <span class="error">{errors.price}</span>}
          </div>
          <div class="field" style={{ flex: 1 }}>
            <label for="p-cost">{fr.edit.buyPrice}</label>
            <input
              id="p-cost"
              inputMode="decimal"
              value={cost}
              placeholder="0,00"
              onInput={(e) => setCost(e.currentTarget.value)}
              aria-invalid={!!errors.cost}
            />
            {errors.cost && <span class="error">{errors.cost}</span>}
          </div>
        </div>
        <div class="field">
          <label>{fr.edit.color}</label>
          <div class="color-swatches">
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                class="swatch"
                style={{ background: c }}
                aria-pressed={c.toLowerCase() === color.toLowerCase()}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div class="row" style={{ alignItems: 'flex-start' }}>
          <div class="field" style={{ flex: 2 }}>
            <label for="p-cat">{fr.edit.category}</label>
            <select
              id="p-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.currentTarget.value)}
            >
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div class="field" style={{ flex: 1 }}>
            <label for="p-pos">{fr.edit.position}</label>
            <input
              id="p-pos"
              type="number"
              min={1}
              inputMode="numeric"
              value={position}
              onInput={(e) => setPosition(e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="row end">
          {p && (
            <button
              type="button"
              class="btn danger"
              onClick={remove}
              style={{ marginRight: 'auto' }}
            >
              {fr.delete}
            </button>
          )}
          <button type="button" class="btn" onClick={props.onClose}>
            {fr.cancel}
          </button>
          <button type="submit" class="btn primary" data-testid="save-product">
            {fr.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
