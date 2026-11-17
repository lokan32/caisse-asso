import { useMemo, useState } from 'preact/hooks';
import { fr } from '../../i18n/fr';
import { Layout } from '../Layout';
import { useNow, useSettings } from '../hooks';
import { useRoute } from '../router';
import { useEventStats } from '../useEventStats';
import { eventDisplayName } from '../../db/events';
import { formatMoney } from '../../lib/money';
import type { ProductStats } from '../../lib/aggregate';
import { SlotChart } from '../SlotChart';

type SortKey = 'qty' | 'revenue' | 'margin';

const pct = (r: number | null) =>
  r === null ? '—' : `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0%`;

export function StatsScreen() {
  const route = useRoute();
  const settings = useSettings();
  const now = useNow(30_000);
  const data = useEventStats(route.query.get('event'), now);
  const [sort, setSort] = useState<SortKey>('qty');
  const [grouped, setGrouped] = useState(false);
  const fmt = (c: number) => formatMoney(c, settings.currency);

  const sorter = useMemo(() => {
    const key = (p: { qty: number; revenueCents: number; marginCents: number }) =>
      sort === 'qty' ? p.qty : sort === 'revenue' ? p.revenueCents : p.marginCents;
    return <T extends { qty: number; revenueCents: number; marginCents: number }>(list: T[]) =>
      list.slice().sort((a, b) => key(b) - key(a));
  }, [sort]);

  if (data === undefined) return <Layout title={fr.stats.title}>{null}</Layout>;
  if (data === null) {
    return (
      <Layout title={fr.stats.title}>
        <p class="muted">{fr.stats.noEvent}</p>
      </Layout>
    );
  }
  const { event, stats } = data;

  const row = (p: ProductStats) => (
    <tr key={p.productId} data-testid={`stat-row-${p.name}`}>
      <td>{p.name}</td>
      <td data-testid="qty">{p.qty}</td>
      <td>{fmt(p.revenueCents)}</td>
      <td>{fmt(p.costCents)}</td>
      <td>{fmt(p.marginCents)}</td>
      <td>{pct(p.marginRate)}</td>
    </tr>
  );

  return (
    <Layout title={fr.stats.title} back="#/">
      <p class="muted" style={{ marginTop: 0 }}>
        {eventDisplayName(event)}
      </p>
      <div class="tiles">
        <div class="tile hero">
          <div class="label">{fr.stats.revenue}</div>
          <div class="value" data-testid="stat-revenue">
            {fmt(stats.revenueCents)}
          </div>
          <div class="sub" data-testid="stat-last30">
            {fr.stats.last30} : {fmt(stats.last30Cents)}
          </div>
        </div>
        <Tile label={fr.stats.orders} value={String(stats.ordersCount)} testId="stat-orders" />
        <Tile label={fr.stats.items} value={String(stats.itemsCount)} testId="stat-items" />
        <Tile label={fr.stats.average} value={fmt(stats.averageCents)} testId="stat-average" />
        <Tile label={fr.stats.cost} value={fmt(stats.costCents)} testId="stat-cost" />
        <Tile
          label={fr.stats.margin}
          value={fmt(stats.marginCents)}
          sub={pct(stats.marginRate)}
          testId="stat-margin"
        />
        <Tile
          label={fr.stats.expectedCash}
          value={fmt(stats.expectedCashCents)}
          sub={`${fr.stats.startingFloat} : ${fmt(stats.floatCents)}`}
          testId="stat-cash"
        />
      </div>

      <section class="card">
        <h2>{fr.stats.activity}</h2>
        <SlotChart slots={stats.slots} currency={settings.currency} />
      </section>

      <section class="card">
        <h2>{fr.stats.perProduct}</h2>
        <div class="row" style={{ marginBottom: '8px' }}>
          <label class="muted" for="sort">
            {fr.stats.sortBy}
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as SortKey)}
            class="tab"
          >
            <option value="qty">{fr.stats.sortQty}</option>
            <option value="revenue">{fr.stats.sortRevenue}</option>
            <option value="margin">{fr.stats.sortMargin}</option>
          </select>
          <label class="check">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => setGrouped(e.currentTarget.checked)}
              data-testid="group-by-category"
            />
            {fr.stats.groupByCategory}
          </label>
        </div>
        {stats.products.length === 0 ? (
          <p class="muted">{fr.stats.noSales}</p>
        ) : (
          <div class="table-wrap">
            <table class="data" data-testid="product-table">
              <thead>
                <tr>
                  <th>{fr.stats.product}</th>
                  <th>{fr.stats.qty}</th>
                  <th>CA</th>
                  <th>{fr.stats.cost}</th>
                  <th>{fr.stats.margin}</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? sorter(stats.categories).map((c) => [
                      ...sorter(c.products).map(row),
                      <tr
                        key={`sub-${c.category}`}
                        class="subtotal"
                        data-testid={`subtotal-${c.category}`}
                      >
                        <td>
                          {fr.stats.subtotal} {c.category}
                        </td>
                        <td>{c.qty}</td>
                        <td>{fmt(c.revenueCents)}</td>
                        <td>{fmt(c.costCents)}</td>
                        <td>{fmt(c.marginCents)}</td>
                        <td>{pct(c.marginRate)}</td>
                      </tr>,
                    ])
                  : sorter(stats.products).map(row)}
                <tr class="total">
                  <td>{fr.stats.total}</td>
                  <td>{stats.itemsCount}</td>
                  <td>{fmt(stats.revenueCents)}</td>
                  <td>{fmt(stats.costCents)}</td>
                  <td>{fmt(stats.marginCents)}</td>
                  <td>{pct(stats.marginRate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Layout>
  );
}

function Tile(props: { label: string; value: string; sub?: string; testId: string }) {
  return (
    <div class="tile">
      <div class="label">{props.label}</div>
      <div class="value" data-testid={props.testId}>
        {props.value}
      </div>
      {props.sub && <div class="sub">{props.sub}</div>}
    </div>
  );
}
