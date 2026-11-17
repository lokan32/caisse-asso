import { useState } from 'preact/hooks';
import { fr } from '../i18n/fr';
import { Dialog } from './components';
import { formatMoney, parseAmount } from '../lib/money';

const NOTES = [500, 1000, 2000, 5000, 10000];

/** Banknotes above the total, e.g. 6,00 → 10, 20, 50 (and 5 if the total is below 5). */
export function quickAmounts(totalCents: number): number[] {
  return NOTES.filter((n) => n > totalCents).slice(0, 4);
}

export function CashDialog(props: {
  totalCents: number;
  currency: string;
  onConfirm: (receivedCents: number) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const received = input === '' ? null : parseAmount(input);
  const change = received === null ? null : received - props.totalCents;
  const fmt = (c: number) => formatMoney(c, props.currency);

  const press = (key: string) => {
    if (key === '⌫') return setInput((s) => s.slice(0, -1));
    setInput((s) => {
      const next = s + key;
      return /^\d{0,6}([.,]\d{0,2})?$/.test(next) ? next.replace('.', ',') : s;
    });
  };

  return (
    <Dialog title={fr.cash.title} onClose={props.onClose} testId="cash-dialog">
      <div class="change-line">
        <span>{fr.order.total}</span>
        <span data-testid="cash-total">{fmt(props.totalCents)}</span>
      </div>
      <label class="muted" for="cash-input">
        {fr.cash.received}
      </label>
      <input
        id="cash-input"
        class="cash-amount"
        inputMode="decimal"
        value={input}
        placeholder="0,00"
        onInput={(e) => setInput(e.currentTarget.value)}
        data-testid="cash-input"
        style={{ width: '100%', border: 0 }}
      />
      <div class="quick-amounts">
        <button
          class="btn"
          onClick={() => setInput((props.totalCents / 100).toFixed(2).replace('.', ','))}
        >
          {fr.cash.exact}
        </button>
        {quickAmounts(props.totalCents).map((n) => (
          <button
            key={n}
            class="btn"
            onClick={() => setInput(String(n / 100))}
            data-testid={`quick-${n / 100}`}
          >
            {fmt(n)}
          </button>
        ))}
      </div>
      <div class="keypad">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '⌫'].map((k) => (
          <button key={k} onClick={() => press(k)} aria-label={k === '⌫' ? fr.cash.clearInput : k}>
            {k}
          </button>
        ))}
      </div>
      {change !== null && change >= 0 && (
        <div class="change-line ok" data-testid="change">
          <span>{fr.cash.change}</span>
          <span>{fmt(change)}</span>
        </div>
      )}
      {change !== null && change < 0 && (
        <div class="change-line missing" data-testid="missing">
          <span>{fr.cash.missing}</span>
          <span>{fmt(-change)}</span>
        </div>
      )}
      <div class="row end">
        <button class="btn" onClick={props.onClose}>
          {fr.cancel}
        </button>
        <button
          class="btn primary"
          disabled={received === null || change === null || change < 0}
          onClick={() => received !== null && props.onConfirm(received)}
          data-testid="cash-confirm"
        >
          {fr.cash.confirm}
        </button>
      </div>
    </Dialog>
  );
}

/** When editing: show the difference to collect or to give back. */
export function AdjustDialog(props: {
  diffCents: number;
  currency: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const fmt = (c: number) => formatMoney(c, props.currency);
  return (
    <Dialog title={fr.cash.title} onClose={props.onClose} testId="adjust-dialog">
      {props.diffCents > 0 && (
        <div class="change-line missing" data-testid="to-collect">
          <span>{fr.cash.toCollect}</span>
          <span>{fmt(props.diffCents)}</span>
        </div>
      )}
      {props.diffCents < 0 && (
        <div class="change-line ok" data-testid="to-give-back">
          <span>{fr.cash.toGiveBack}</span>
          <span>{fmt(-props.diffCents)}</span>
        </div>
      )}
      <div class="row end">
        <button class="btn" onClick={props.onClose}>
          {fr.cancel}
        </button>
        <button class="btn primary" onClick={props.onConfirm} data-testid="adjust-confirm">
          {fr.order.saveEdit}
        </button>
      </div>
    </Dialog>
  );
}
