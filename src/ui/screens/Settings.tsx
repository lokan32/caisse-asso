import { useState } from 'preact/hooks';
import { fr } from '../../i18n/fr';
import { Icon } from '../Icon';
import { Layout } from '../Layout';
import { useLiveQuery, useSettings } from '../hooks';
import { setSetting } from '../../db/settings';
import {
  activateEvent,
  closeEvent,
  eventDisplayName,
  getActiveEvent,
  listEvents,
  startEvent,
} from '../../db/events';
import type { PosEvent } from '../../db/types';
import { confirmDialog, toast } from '../components';
import { isoDate } from '../../lib/dates';
import { formatMoney, parseAmount } from '../../lib/money';
import { onEventClosed } from '../../sync/hooks';
import { AccountSection } from '../AccountSection';

export function SettingsScreen() {
  const settings = useSettings();
  return (
    <Layout title={fr.settings.title}>
      <EventsSection />
      <section class="card">
        <h2>{fr.settings.title}</h2>
        <div class="field">
          <label for="currency">{fr.settings.currency}</label>
          <input
            id="currency"
            value={settings.currency}
            maxLength={4}
            onInput={(e) => void setSetting('currency', e.currentTarget.value.trim())}
            style={{ maxWidth: '120px' }}
          />
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={settings.changeStep}
            onChange={(e) => void setSetting('changeStep', e.currentTarget.checked)}
            data-testid="change-step"
          />
          {fr.settings.changeStep}
        </label>
      </section>
      <AccountSection />
    </Layout>
  );
}

function EventsSection() {
  const settings = useSettings();
  const events = useLiveQuery(listEvents, [], [] as PosEvent[]);
  const [showForm, setShowForm] = useState(false);

  return (
    <section class="card" data-testid="events">
      <h2>{fr.events.title}</h2>
      {showForm ? (
        <StartEventForm onDone={() => setShowForm(false)} />
      ) : (
        <button class="btn primary" onClick={() => setShowForm(true)} data-testid="start-event">
          {fr.events.start}
        </button>
      )}
      <ul class="list" style={{ marginTop: '12px' }}>
        {events.length === 0 && <li class="muted">{fr.events.none}</li>}
        {events.map((e) => {
          const active = e.id === settings.activeEventId && e.status === 'open';
          return (
            <li key={e.id} class="list-item" data-testid="event-item">
              <div class="main">
                <div>
                  <strong>{eventDisplayName(e)}</strong>
                </div>
                <span class={`pill ${e.status === 'closed' ? 'voided' : active ? 'pending' : ''}`}>
                  {e.status === 'closed'
                    ? fr.events.closed
                    : active
                      ? fr.events.active
                      : fr.events.open}
                </span>
                {e.floatCents > 0 && (
                  <span class="muted">
                    {' '}
                    · {fr.events.startingFloat.replace(' (facultatif)', '')}{' '}
                    {formatMoney(e.floatCents, settings.currency)}
                  </span>
                )}
              </div>
              {e.status === 'open' && !active && (
                <button class="btn" onClick={() => activateEvent(e.id)}>
                  {fr.events.activate}
                </button>
              )}
              <a class="btn" href={`#/stats?event=${e.id}`} aria-label={fr.stats.title}>
                <Icon name="chart" size={20} />
              </a>
              {e.status === 'open' && (
                <button
                  class="btn danger"
                  onClick={async () => {
                    if (
                      await confirmDialog(fr.events.closeConfirm(eventDisplayName(e)), {
                        confirmLabel: fr.events.close,
                        danger: true,
                      })
                    ) {
                      await closeEvent(e.id);
                      onEventClosed();
                    }
                  }}
                >
                  {fr.events.close}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StartEventForm(props: { onDone: () => void }) {
  const [date, setDate] = useState(isoDate());
  const [label, setLabel] = useState('');
  const [float, setFloat] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const floatCents = float.trim() ? parseAmount(float) : 0;
        if (floatCents === null) return setError(fr.edit.invalidPrice);
        if ((await getActiveEvent()) && !(await confirmDialog(fr.events.switchConfirm))) return;
        const ev = await startEvent({ startDate: date, label, floatCents });
        toast(eventDisplayName(ev));
        props.onDone();
      }}
    >
      <div class="field">
        <label for="ev-date">{fr.events.startDate}</label>
        <input
          id="ev-date"
          type="date"
          required
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="ev-label">{fr.events.label}</label>
        <input id="ev-label" value={label} onInput={(e) => setLabel(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label for="ev-float">{fr.events.startingFloat}</label>
        <input
          id="ev-float"
          inputMode="decimal"
          value={float}
          placeholder="0,00"
          onInput={(e) => setFloat(e.currentTarget.value)}
          aria-invalid={!!error}
        />
        {error && <span class="error">{error}</span>}
      </div>
      <div class="row end">
        <button type="button" class="btn" onClick={props.onDone}>
          {fr.cancel}
        </button>
        <button type="submit" class="btn primary" data-testid="confirm-start-event">
          {fr.events.start}
        </button>
      </div>
    </form>
  );
}
