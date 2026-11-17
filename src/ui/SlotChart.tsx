import { useState } from 'preact/hooks';
import type { Slot } from '../lib/aggregate';
import { formatTime } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { fr } from '../i18n/fr';

const W = 360;
const H = 180;
const PAD = { top: 18, right: 8, bottom: 22, left: 40 };

/** Clean axis maximum: 1, 2, 2.5 or 5 × 10^n. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Column chart of revenue per time slot (single series: no legend, title names it). */
export function SlotChart(props: { slots: Slot[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const slots = props.slots.slice(-16); // the last 8 hours fit on a phone
  if (slots.length === 0) return <p class="muted">{fr.stats.noSales}</p>;

  const maxUnits = niceMax(Math.max(...slots.map((s) => s.revenueCents)) / 100);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / slots.length;
  const barW = Math.min(24, band - 2);
  const y = (cents: number) => PAD.top + plotH - (cents / 100 / maxUnits) * plotH;
  const ticks = [0, maxUnits / 2, maxUnits];
  const maxIndex = slots.reduce(
    (best, s, i) => (s.revenueCents > slots[best].revenueCents ? i : best),
    0,
  );
  const labelEvery = Math.ceil(slots.length / 6);
  const fmtTick = (u: number) => (u >= 10000 ? `${u / 1000}k` : String(u));

  // Column with 4px rounded top, square at the baseline.
  const column = (x: number, top: number, w: number, bottom: number) => {
    const h = bottom - top;
    if (h <= 0) return '';
    const r = Math.min(4, h, w / 2);
    return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
  };

  const a = active !== null ? slots[active] : null;

  return (
    <div class="chart" data-testid="slot-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fr.stats.activity}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t * 100)}
              y2={y(t * 100)}
              stroke="#e5e7eb"
              stroke-width={1}
            />
            <text class="axis-label" x={PAD.left - 4} y={y(t * 100) + 3} text-anchor="end">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {slots.map((s, i) => {
          const x = PAD.left + i * band + (band - barW) / 2;
          const top = y(s.revenueCents);
          const label = `${formatTime(s.start)} : ${formatMoney(s.revenueCents, props.currency)}, ${s.orders} commande(s)`;
          return (
            <g key={s.start}>
              {/* Hit target: the whole band, taller than the mark. */}
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={plotH}
                fill={active === i ? 'rgb(29 78 216 / 0.06)' : 'transparent'}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onClick={() => setActive(i)}
                tabIndex={0}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={label}
                data-testid={`slot-${formatTime(s.start)}`}
                data-orders={s.orders}
              />
              <path class="bar" d={column(x, top, barW, PAD.top + plotH)} pointer-events="none" />
              {i === maxIndex && s.revenueCents > 0 && (
                <text class="value-label" x={x + barW / 2} y={top - 4} text-anchor="middle">
                  {formatMoney(s.revenueCents, '')}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text class="axis-label" x={x + barW / 2} y={H - 6} text-anchor="middle">
                  {formatTime(s.start)}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="#9ca3af"
          stroke-width={1}
        />
      </svg>
      <div class="chart-tooltip" aria-live="polite">
        {a ? (
          <>
            <strong>{formatTime(a.start)}</strong> · {formatMoney(a.revenueCents, props.currency)} ·{' '}
            {a.orders} cde(s)
          </>
        ) : (
          '\u00a0'
        )}
      </div>
      <details>
        <summary class="muted">Tableau</summary>
        <table class="data">
          <thead>
            <tr>
              <th>Heure</th>
              <th>{fr.stats.orders}</th>
              <th>{fr.stats.revenue}</th>
            </tr>
          </thead>
          <tbody>
            {props.slots.map((s) => (
              <tr key={s.start}>
                <td>{formatTime(s.start)}</td>
                <td>{s.orders}</td>
                <td>{formatMoney(s.revenueCents, props.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
