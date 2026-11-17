import { useEffect, useState } from 'preact/hooks';
import { fr } from '../../i18n/fr';
import { Icon } from '../Icon';
import { Layout } from '../Layout';
import { useActiveEvent } from '../useActiveEvent';
import { NoEventPrompt } from '../NoEvent';
import { useLiveQuery, useSettings } from '../hooks';
import { db } from '../../db/db';
import { listCategories } from '../../db/catalog';
import type { Category, Order, Product } from '../../db/types';
import { CategoryTabs, ProductButton } from '../ProductButton';
import {
  addProduct,
  changeQty,
  clearCart,
  getCart,
  removeLine,
  startEditing,
  useCart,
} from '../cart';
import { formatMoney } from '../../lib/money';
import { linesTotal } from '../../lib/aggregate';
import { AdjustDialog, CashDialog } from '../CashDialog';
import { adjustReceived, editOrder, recordOrder, voidOrder } from '../../db/orders';
import { confirmDialog, toast } from '../components';
import { navigate, useRoute } from '../router';
import { onLocalChange } from '../../sync/hooks';

export function OrderScreen() {
  const route = useRoute();
  const editId = route.query.get('edit');
  const event = useActiveEvent();
  const settings = useSettings();
  const cart = useCart();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cash' | 'adjust' | null>(null);
  const [busy, setBusy] = useState(false);

  // Entering edit mode from the history: load the order into the current order.
  useEffect(() => {
    if (!editId || getCart().editing?.id === editId) return;
    void (async () => {
      const order = await db.orders.get(editId);
      const ev = order && (await db.events.get(order.eventId));
      if (!order || !ev || order.status === 'voided' || ev.status === 'closed')
        return navigate('/history');
      startEditing(order);
    })();
  }, [editId]);

  // Buttons of the event type: the edited order's event, else the active event.
  const eventId = cart.editing?.eventId ?? event?.id ?? null;
  const categories = useLiveQuery(
    async () => {
      const ev = eventId ? await db.events.get(eventId) : undefined;
      return ev ? listCategories(ev.typeId) : [];
    },
    [eventId],
    [] as Category[],
  );
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

  const editing = cart.editing;
  const total = linesTotal(cart.lines);
  const fmt = (c: number) => formatMoney(c, settings.currency);
  const qtyOf = (id: string) => cart.lines.find((l) => l.productId === id)?.qty ?? 0;

  if (!editing && event === null) {
    return (
      <Layout title={fr.order.title}>
        <NoEventPrompt />
      </Layout>
    );
  }

  const record = async (receivedCents?: number) => {
    if (!event || busy) return;
    setBusy(true);
    try {
      const order = await recordOrder(event.id, getCart().lines, receivedCents);
      clearCart();
      setDialog(null);
      toast(fr.order.recorded(order.seq));
      onLocalChange();
    } finally {
      setBusy(false);
    }
  };

  const checkout = () => {
    if (cart.lines.length === 0) return;
    if (settings.changeStep) setDialog('cash');
    else void record();
  };

  const finishEdit = async (order: Order, receivedCents?: number) => {
    await editOrder(order.id, getCart().lines, receivedCents);
    clearCart();
    setDialog(null);
    toast(fr.order.recorded(order.seq));
    onLocalChange();
    navigate(`/history/${order.id}`);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (cart.lines.length === 0) {
      if (
        await confirmDialog(fr.order.emptyEdit, {
          confirmLabel: fr.order.voidInstead,
          danger: true,
        })
      ) {
        await voidOrder(editing.id);
        clearCart();
        onLocalChange();
        navigate(`/history/${editing.id}`);
      }
      return;
    }
    const adj = adjustReceived(editing, total);
    if (settings.changeStep && adj.diffCents !== 0) setDialog('adjust');
    else await finishEdit(editing);
  };

  const cancelEdit = () => {
    const id = editing?.id;
    clearCart();
    navigate(id ? `/history/${id}` : '/order');
  };

  return (
    <Layout
      title={fr.order.title}
      actions={
        <a href="#/stats" aria-label={fr.stats.title} data-testid="order-stats-link">
          <Icon name="chart" size={20} />
        </a>
      }
    >
      {editing && (
        <div class="edit-banner" data-testid="edit-banner" style={{ marginBottom: '8px' }}>
          {fr.order.editing(editing.seq)}
        </div>
      )}
      <div class="order-layout">
        <div class="order-products">
          <CategoryTabs categories={categories} selected={selected} onSelect={setSelected} />
          {categories.length === 0 && <p class="muted">{fr.order.noCategories}</p>}
          {categories.length > 0 && products.length === 0 && (
            <p class="muted">{fr.order.noProducts}</p>
          )}
          <div class="product-grid" data-testid="order-grid">
            {products.map((p) => (
              <ProductButton
                key={p.id}
                product={p}
                currency={settings.currency}
                qty={qtyOf(p.id)}
                onClick={() =>
                  addProduct(
                    p,
                    categories.find((c) => c.id === p.categoryId),
                  )
                }
              />
            ))}
          </div>
        </div>

        <aside class="order-panel" data-testid="order-panel">
          {cart.lines.length === 0 ? (
            <p class="muted">{fr.order.empty}</p>
          ) : (
            <ul class="order-lines">
              {cart.lines.map((l) => (
                <li key={l.productId} class="order-line" data-testid={`line-${l.name}`}>
                  <span class="name">
                    {l.name} <strong>x{l.qty}</strong>
                  </span>
                  <button
                    class="qty-btn"
                    onClick={() => changeQty(l.productId, -1)}
                    aria-label={`${fr.order.decrease} ${l.name}`}
                  >
                    −
                  </button>
                  <button
                    class="qty-btn"
                    onClick={() => changeQty(l.productId, 1)}
                    aria-label={`${fr.order.increase} ${l.name}`}
                  >
                    +
                  </button>
                  <span class="amount">{fmt(l.qty * l.unitPriceCents)}</span>
                  <button
                    class="qty-btn"
                    onClick={() => removeLine(l.productId)}
                    aria-label={`${fr.order.remove} ${l.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div class="order-total">
            <span>{fr.order.total}</span>
            <span data-testid="order-total">{fmt(total)}</span>
          </div>
          {editing ? (
            <div class="row">
              <button
                class="btn"
                style={{ flex: 1 }}
                onClick={cancelEdit}
                data-testid="cancel-edit"
              >
                {fr.order.cancelEdit}
              </button>
              <button
                class="btn primary"
                style={{ flex: 2 }}
                onClick={saveEdit}
                data-testid="save-edit"
              >
                {fr.order.saveEdit}
              </button>
            </div>
          ) : (
            <div class="row">
              <button
                class="btn"
                style={{ flex: 1 }}
                onClick={clearCart}
                disabled={cart.lines.length === 0}
                data-testid="clear-order"
              >
                {fr.order.clear}
              </button>
              <button
                class="btn primary big"
                style={{ flex: 2 }}
                onClick={checkout}
                disabled={cart.lines.length === 0 || busy}
                data-testid="checkout"
              >
                {fr.order.checkout}
              </button>
            </div>
          )}
        </aside>
      </div>

      {dialog === 'cash' && (
        <CashDialog
          totalCents={total}
          currency={settings.currency}
          onClose={() => setDialog(null)}
          onConfirm={(r) => void record(r)}
        />
      )}
      {dialog === 'adjust' && editing && (
        <AdjustDialog
          diffCents={adjustReceived(editing, total).diffCents}
          currency={settings.currency}
          onClose={() => setDialog(null)}
          onConfirm={() => void finishEdit(editing, adjustReceived(editing, total).receivedCents)}
        />
      )}
    </Layout>
  );
}
