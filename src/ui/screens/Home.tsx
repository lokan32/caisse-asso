import { fr } from '../../i18n/fr';
import { Icon } from '../Icon';
import { eventDisplayName } from '../../db/events';
import { useActiveEvent } from '../useActiveEvent';
import { useEventStats } from '../useEventStats';
import { useSettings } from '../hooks';
import { formatMoney } from '../../lib/money';
import { SyncIndicator } from '../SyncIndicator';

const entries = [
  { href: '#/order', label: fr.home.takeOrder, icon: 'cart', id: 'order' },
  { href: '#/edit', label: fr.home.editButtons, icon: 'grid', id: 'edit' },
  { href: '#/history', label: fr.home.history, icon: 'receipt', id: 'history' },
  { href: '#/settings', label: fr.home.settings, icon: 'gear', id: 'settings' },
  { href: '#/export', label: fr.home.export, icon: 'cloud', id: 'export' },
];

export function HomeScreen() {
  const event = useActiveEvent();
  return (
    <div class="screen home">
      <header class="home-header">
        <h1>{fr.appName}</h1>
        <div class="event-name" data-testid="active-event">
          {event === undefined
            ? '\u00a0'
            : event
              ? `${fr.home.activeEvent} : ${eventDisplayName(event)}`
              : fr.home.noActiveEvent}
        </div>
      </header>
      <main class="content">
        {event && <LiveSummary />}
        <SyncIndicator />
        <nav class="home-grid">
          {entries.map((e) => (
            <a
              key={e.id}
              class={`home-btn home-${e.id}`}
              href={e.href}
              data-testid={`home-${e.id}`}
            >
              <span class="home-icon">
                <Icon name={e.icon} size={36} />
              </span>
              <span>{e.label}</span>
            </a>
          ))}
        </nav>
      </main>
    </div>
  );
}

function LiveSummary() {
  const settings = useSettings();
  const data = useEventStats(null, 0);
  if (!data) return null;
  return (
    <a class="home-stats" href="#/stats" data-testid="home-stats">
      <div>
        <div class="muted">{fr.home.revenue}</div>
        <div class="figure" data-testid="home-revenue">
          {formatMoney(data.stats.revenueCents, settings.currency)}
        </div>
      </div>
      <div>
        <div class="muted">{fr.home.orders}</div>
        <div class="figure" data-testid="home-orders">
          {data.stats.ordersCount}
        </div>
      </div>
      <Icon name="chart" />
    </a>
  );
}
