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
import type { EventType, PosEvent } from '../../db/types';
import { Dialog, confirmDialog, toast } from '../components';
import {
  createEventType,
  defaultTypeId,
  deleteEventType,
  listEventTypes,
  renameEventType,
  typeName,
} from '../../db/event-types';
import { isoDate } from '../../lib/dates';
import { formatMoney, parseAmount } from '../../lib/money';
import { onEventClosed } from '../../sync/hooks';
import { AccountSection } from '../AccountSection';

export function SettingsScreen() {
  const settings = useSettings();
  return (
    <Layout title={fr.settings.title}>
      <EventTypesSection />
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

function EventTypesSection() {
  const types = useLiveQuery(listEventTypes, [], [] as EventType[]);
  const [dialog, setDialog] = useState<EventType | 'new' | null>(null);

  const remove = async (t: EventType) => {
    if (
      !(await confirmDialog(fr.types.deleteConfirm(t.name), {
        confirmLabel: fr.delete,
        danger: true,
      }))
    )
      return;
    try {
      await deleteEventType(t.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section class="card" data-testid="event-types">
      <h2>{fr.types.title}</h2>
      <button class="btn primary" onClick={() => setDialog('new')} data-testid="create-type">
        {fr.types.create}
      </button>
      <ul class="list" style={{ marginTop: '12px' }}>
        {types.map((t) => (
          <li key={t.id} class="list-item" data-testid="type-item">
            <div class="main">
              <strong data-testid="type-name">{t.name}</strong>
            </div>
            <a
              class="btn"
              href={`#/edit?type=${t.id}`}
              aria-label={`${fr.home.editButtons} ${t.name}`}
            >
              <Icon name="grid" size={20} />
            </a>
            <button class="btn" onClick={() => setDialog(t)} data-testid="rename-type">
              {fr.types.rename}
            </button>
            {types.length > 1 && (
              <button class="btn danger" onClick={() => remove(t)} data-testid="delete-type">
                {fr.delete}
              </button>
            )}
          </li>
        ))}
      </ul>
      {dialog && (
        <EventTypeDialog
          type={dialog === 'new' ? null : dialog}
          types={types}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function EventTypeDialog(props: {
  type: EventType | null;
  types: EventType[];
  onClose: () => void;
}) {
  const [name, setName] = useState(props.type?.name ?? '');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  return (
    <Dialog
      title={props.type ? fr.types.rename : fr.types.create}
      onClose={props.onClose}
      testId="type-dialog"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (props.type) await renameEventType(props.type.id, name);
            else {
              const t = await createEventType(name, source || undefined);
              toast(fr.types.created(t.name));
            }
            props.onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <div class="field">
          <label for="type-name">{fr.types.name}</label>
          <input
            id="type-name"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoFocus
            aria-invalid={!!error}
          />
          {error && <span class="error">{error}</span>}
        </div>
        {!props.type && (
          <div class="field">
            <label for="type-source">{fr.types.source}</label>
            <select
              id="type-source"
              value={source}
              onChange={(e) => setSource(e.currentTarget.value)}
            >
              <option value="">{fr.types.empty}</option>
              {props.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {fr.types.copyOf(t.name)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div class="row end">
          <button type="button" class="btn" onClick={props.onClose}>
            {fr.cancel}
          </button>
          <button type="submit" class="btn primary" data-testid="save-type">
            {fr.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EventsSection() {
  const settings = useSettings();
  const events = useLiveQuery(listEvents, [], [] as PosEvent[]);
  const types = useLiveQuery(listEventTypes, [], [] as EventType[]);
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
                <span class="muted" data-testid="event-type">
                  {typeName(types, e.typeId)}
                </span>{' '}
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
  const types = useLiveQuery(listEventTypes, [], [] as EventType[]);
  const fallbackType = useLiveQuery(defaultTypeId, [], null as string | null);
  const [chosenType, setTypeId] = useState('');
  const typeId = chosenType || fallbackType || '';
  const [date, setDate] = useState(isoDate());
  const [label, setLabel] = useState('');
  const [float, setFloat] = useState('');
  const [error, setError] = useState('');
  const [typeError, setTypeError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!typeId) return setTypeError(fr.types.required);
        const floatCents = float.trim() ? parseAmount(float) : 0;
        if (floatCents === null) return setError(fr.edit.invalidPrice);
        if ((await getActiveEvent()) && !(await confirmDialog(fr.events.switchConfirm))) return;
        const ev = await startEvent({ typeId, startDate: date, label, floatCents });
        toast(eventDisplayName(ev));
        props.onDone();
      }}
    >
      <div class="field">
        <label for="ev-type">{fr.types.type}</label>
        <select
          id="ev-type"
          value={typeId}
          required
          onChange={(e) => {
            setTypeId(e.currentTarget.value);
            setTypeError('');
          }}
          aria-invalid={!!typeError}
        >
          {!typeId && <option value="">—</option>}
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {typeError && <span class="error">{typeError}</span>}
      </div>
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
