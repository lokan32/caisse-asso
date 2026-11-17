import { useEffect, useState } from 'preact/hooks';
import type { Category, Order, OrderLine, Product } from '../db/types';

/**
 * The order being composed. Kept in memory at module level so it survives
 * navigating between screens (e.g. a quick look at the stats).
 */
export interface CartState {
  lines: OrderLine[];
  /** Set when an existing order is being edited. */
  editing: Order | null;
}

let state: CartState = { lines: [], editing: null };
const listeners = new Set<(s: CartState) => void>();

function set(next: CartState) {
  state = next;
  for (const l of listeners) l(state);
}

export function getCart(): CartState {
  return state;
}

export function useCart(): CartState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/** Add one unit. A product already in the order keeps its line price (important when editing). */
export function addProduct(product: Product, category: Category | undefined) {
  const existing = state.lines.find((l) => l.productId === product.id);
  if (existing) return changeQty(product.id, 1);
  set({
    ...state,
    lines: [
      ...state.lines,
      {
        productId: product.id,
        name: product.name,
        category: category?.name ?? '',
        qty: 1,
        unitPriceCents: product.priceCents,
        unitCostCents: product.costCents,
      },
    ],
  });
}

export function changeQty(productId: string, delta: number) {
  set({
    ...state,
    lines: state.lines
      .map((l) => (l.productId === productId ? { ...l, qty: l.qty + delta } : l))
      .filter((l) => l.qty > 0),
  });
}

export function removeLine(productId: string) {
  set({ ...state, lines: state.lines.filter((l) => l.productId !== productId) });
}

export function clearCart() {
  set({ lines: [], editing: null });
}

export function startEditing(order: Order) {
  set({ lines: order.lines.map((l) => ({ ...l })), editing: order });
}

/** Load a past order's lines (used by tests and future features). */
export function setLines(lines: OrderLine[]) {
  set({ ...state, lines });
}
