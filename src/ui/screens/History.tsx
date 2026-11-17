import { useEffect, useState } from 'preact/hooks';
import { fr } from '../../i18n/fr';
import { Icon } from '../Icon';
import { Layout } from '../Layout';
import { useLiveQuery, useSettings } from '../hooks';
import { db } from '../../db/db';
import type { Order, PosEvent } from '../../db/types';
import { eventDisplayName, listEvents } from '../../db/events';
import { listOrders, voidOrder } from '../../db/orders';
import { formatMoney } from '../../lib/money';
import { formatDateTime, formatTime } from '../../lib/dates';
import { confirmDialog } from '../components';
import { navigate, useRoute } from '../router';
import { onLocalChange } from '../../sync/hooks';

export function HistoryScreen() {
  const route = useRoute();
  const orderId = route.params[0];
  return orderId ? <OrderDetail id={orderId} /> : <OrderList />;
}

function StatusPills(props: { order: Order; event: PosEvent }) {
  const { order, event } = props;
  return (
    <>
      {order.status === 'voided' && <span class="pill voided">{fr.history.voided}</span>}{' '}
      {order.status === 'modified' && <span class="pill modified">{fr.history.modified}</span>}{' '}
      {order.revision > event.syncedRevision ? (
        <span class="pill pending">{fr.history.notSynced}</span>
      ) : (
        <span class="pill">{fr.history.synced}</span>
      )}
    </>
  );
}

function OrderList() {
  const settings = useSettings();
  const events = useLiveQuery(listEvents, [], [] as PosEvent[]);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && events.some((e) => e.id === eventId)) return;
    const active = events.find((e) => e.id === settings.activeEventId && e.status === 'open');
    setEventId(active?.id ?? events[0]?.id ?? null);
  }, [events, settings.activeEventId, eventId]);

  const event = events.find((e) => e.id === eventId) ?? null;
  const orders = useLiveQuery(
    async () => (eventId ? (await listOrders(eventId)).reverse() : []),
    [eventId],
    [] as Order[],
  );
  const fmt = (c: number) => formatMoney(c, settings.currency);

  return (
    <Layout title={fr.history.title}>
      {events.length > 1 && (
        <div class="field">
          <label for="h-event">{fr.history.event}</label>
          <select
            id="h-event"
            value={eventId ?? ''}
            onChange={(e) => setEventId(e.currentTarget.value)}
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {eventDisplayName(e)}
              </option>
            ))}
          </select>
        </div>
      )}
      {event && events.length <= 1 && <p class="muted">{eventDisplayName(event)}</p>}
      {orders.length === 0 && <p class="muted">{fr.history.empty}</p>}
      <ul class="list" data-testid="history-list">
        {event &&
          orders.map((o) => (
            <li key={o.id}>
              <a
                class={`list-item ${o.status === 'voided' ? 'voided' : ''}`}
                href={`#/history/${o.id}`}
                data-testid={`order-${o.seq}`}
              >
                <strong>{fr.history.number(o.seq)}</strong>
                <div class="main">
                  <div>
                    {formatTime(o.createdAt)} ·{' '}
                    {fr.history.items(o.lines.reduce((s, l) => s + l.qty, 0))}
                  </div>
                  <StatusPills order={o} event={event} />
                </div>
                <span class="amount">{fmt(o.totalCents)}</span>
              </a>
            </li>
          ))}
      </ul>
    </Layout>
  );
}

function OrderDetail(props: { id: string }) {
  const settings = useSettings();
  const data = useLiveQuery(
    async () => {
      const order = await db.orders.get(props.id);
      const event = order ? await db.events.get(order.eventId) : undefined;
      return order && event ? { order, event } : null;
    },
    [props.id],
    undefined as { order: Order; event: PosEvent } | null | undefined,
  );
  const fmt = (c: number) => formatMoney(c, settings.currency);

  if (data === undefined)
    return (
      <Layout title={fr.history.details} back="#/history">
        {null}
      </Layout>
    );
  if (data === null) {
    return (
      <Layout title={fr.history.details} back="#/history">
        <p class="muted">{fr.history.empty}</p>
      </Layout>
    );
  }
  const { order, event } = data;
  const canChange = event.status === 'open' && order.status !== 'voided';

  const onVoid = async () => {
    if (
      await confirmDialog(fr.history.voidConfirm(order.seq), {
        confirmLabel: fr.history.void,
        danger: true,
      })
    ) {
      await voidOrder(order.id);
      onLocalChange();
    }
  };

  return (
    <Layout title={`${fr.history.details} ${fr.history.number(order.seq)}`} back="#/history">
      <section class="card" data-testid="order-detail">
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <span>{formatDateTime(order.createdAt)}</span>
          <span>
            <StatusPills order={order} event={event} />
          </span>
        </div>
        {order.updatedAt && order.status === 'modified' && (
          <p class="muted" data-testid="last-edit">
            {fr.history.lastEdit} {formatDateTime(order.updatedAt)}
          </p>
        )}
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>{fr.history.product}</th>
                <th>{fr.history.qty}</th>
                <th>{fr.history.unitPrice}</th>
                <th>{fr.history.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td>{l.qty}</td>
                  <td>{fmt(l.unitPriceCents)}</td>
                  <td>{fmt(l.qty * l.unitPriceCents)}</td>
                </tr>
              ))}
              <tr class="total">
                <td>{fr.order.total}</td>
                <td />
                <td />
                <td data-testid="detail-total">{fmt(order.totalCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {order.receivedCents !== undefined && (
          <p>
            {fr.history.received} :{' '}
            <strong data-testid="detail-received">{fmt(order.receivedCents)}</strong> ·{' '}
            {fr.history.change} :{' '}
            <strong data-testid="detail-change">
              {fmt(order.receivedCents - order.totalCents)}
            </strong>
          </p>
        )}
      </section>
      {canChange && (
        <div class="row">
          <button
            class="btn primary"
            onClick={() => navigate(`/order?edit=${order.id}`)}
            data-testid="edit-order"
          >
            <Icon name="pencil" size={18} /> {fr.history.edit}
          </button>
          <button class="btn danger" onClick={onVoid} data-testid="void-order">
            {fr.history.void}
          </button>
        </div>
      )}
    </Layout>
  );
}
