import type { Product } from '../db/types';
import { textColorFor } from '../lib/colors';
import { formatMoney } from '../lib/money';

export function ProductButton(props: {
  product: Product;
  currency: string;
  qty?: number;
  onClick: () => void;
}) {
  const { product } = props;
  return (
    <button
      class="product-btn"
      style={{ background: product.color, color: textColorFor(product.color) }}
      onClick={props.onClick}
      data-testid={`product-${product.name}`}
      aria-label={`${product.name} ${formatMoney(product.priceCents, props.currency)}`}
    >
      <span class="name">{product.name}</span>
      <span class="price">{formatMoney(product.priceCents, props.currency)}</span>
      {props.qty ? (
        <span class="badge" data-testid={`badge-${product.name}`}>
          {props.qty}
        </span>
      ) : null}
    </button>
  );
}

export function CategoryTabs(props: {
  categories: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  extra?: preact.ComponentChildren;
}) {
  return (
    <div class="tabs" role="tablist">
      {props.categories.map((c) => (
        <button
          key={c.id}
          role="tab"
          class="tab"
          aria-selected={c.id === props.selected}
          onClick={() => props.onSelect(c.id)}
        >
          {c.name}
        </button>
      ))}
      {props.extra}
    </div>
  );
}
