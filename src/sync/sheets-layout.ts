import type { Category, Order, PosEvent, Product } from '../db/types';
import type { CellValue } from './google-api';
import { fr } from '../i18n/fr';
import { aggregate, type EventStats } from '../lib/aggregate';
import { centsToUnits, parseAmount } from '../lib/money';
import { formatDateTime } from '../lib/dates';
import { DEFAULT_COLOR, isHexColor } from '../lib/colors';
import { eventDisplayName } from '../db/events';

const S = fr.sheets;

/* ------------------------------------------------------------------ */
/* pos-config                                                          */
/* ------------------------------------------------------------------ */

/** Sheets forbids []*?:/\ in tab names and limits them to 100 characters. */
export function sanitizeTabTitle(name: string): string {
  const cleaned = name
    .replace(/[[\]*?:/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'Catégorie';
}

export interface Tab {
  title: string;
  rows: CellValue[][];
}

/** One tab per category (in category order), header + one row per product. */
export function buildConfigTabs(categories: Category[], products: Product[]): Tab[] {
  const used = new Set<string>();
  return categories
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => {
      let title = sanitizeTabTitle(c.name);
      for (let n = 2; used.has(title.toLowerCase()); n++)
        title = `${sanitizeTabTitle(c.name).slice(0, 95)} (${n})`;
      used.add(title.toLowerCase());
      const rows: CellValue[][] = [
        [...S.configHeaders],
        ...products
          .filter((p) => p.categoryId === c.id)
          .sort((a, b) => a.position - b.position)
          .map((p) => [
            p.id,
            p.name,
            centsToUnits(p.priceCents),
            centsToUnits(p.costCents),
            p.color,
            p.position,
          ]),
      ];
      return { title, rows };
    });
}

export interface ImportProblem {
  sheet: string;
  row: number;
  reason: string;
}

export interface ImportResult {
  categories: Category[];
  products: Product[];
  problems: ImportProblem[];
}

function toCents(v: CellValue | undefined): number | null {
  if (v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  return parseAmount(String(v));
}

/**
 * Parse pos-config tabs (rows include the header). Invalid rows are skipped and reported.
 */
export function parseConfigTabs(tabs: Tab[], newId: () => string): ImportResult {
  const categories: Category[] = [];
  const products: Product[] = [];
  const problems: ImportProblem[] = [];
  const seenIds = new Set<string>();

  tabs.forEach((tab, ci) => {
    const category: Category = { id: newId(), name: tab.title, position: ci + 1 };
    categories.push(category);
    const parsed: Product[] = [];
    tab.rows.slice(1).forEach((row, i) => {
      const rowNumber = i + 2;
      if (row.every((c) => c === '' || c === undefined || c === null)) return;
      const [rawId, rawName, rawPrice, rawCost, rawColor, rawPos] = row;
      const name = String(rawName ?? '').trim();
      if (!name)
        return problems.push({ sheet: tab.title, row: rowNumber, reason: fr.edit.nameRequired });
      const priceCents = toCents(rawPrice);
      if (priceCents === null)
        return problems.push({
          sheet: tab.title,
          row: rowNumber,
          reason: `${fr.edit.salePrice} : ${fr.edit.invalidPrice}`,
        });
      const costCents = rawCost === undefined || rawCost === '' ? 0 : toCents(rawCost);
      if (costCents === null)
        return problems.push({
          sheet: tab.title,
          row: rowNumber,
          reason: `${fr.edit.buyPrice} : ${fr.edit.invalidPrice}`,
        });
      let id = String(rawId ?? '').trim();
      if (!id || seenIds.has(id)) id = newId();
      seenIds.add(id);
      const color = isHexColor(String(rawColor ?? '')) ? String(rawColor) : DEFAULT_COLOR;
      const pos = typeof rawPos === 'number' ? rawPos : parseFloat(String(rawPos ?? ''));
      parsed.push({
        id,
        categoryId: category.id,
        name,
        priceCents,
        costCents,
        color,
        position: Number.isFinite(pos) ? pos : 1e6 + i,
      });
    });
    // Normalise positions to 1..n keeping the sheet's order of positions.
    parsed
      .sort((a, b) => a.position - b.position)
      .forEach((p, k) => products.push({ ...p, position: k + 1 }));
  });
  return { categories, products, problems };
}

/* ------------------------------------------------------------------ */
/* event-<date>                                                         */
/* ------------------------------------------------------------------ */

export interface EventSheets {
  orders: CellValue[][];
  summary: CellValue[][];
  /** 0-based column indexes in "Commandes" holding amounts. */
  ordersMoneyColumns: number[];
}

const statusLabel = (o: Order) =>
  o.status === 'voided' ? S.statusVoided : o.status === 'modified' ? S.statusModified : S.statusOk;

/** Product columns in order of first sale (voided orders included: their rows still show quantities). */
function productColumns(orders: Order[]): { productId: string; header: string }[] {
  const cols: { productId: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const o of orders.slice().sort((a, b) => a.seq - b.seq)) {
    for (const l of o.lines) {
      if (!seen.has(l.productId)) {
        seen.add(l.productId);
        cols.push({ productId: l.productId, name: l.name });
      }
    }
  }
  const counts = new Map<string, number>();
  for (const c of cols) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return cols.map((c) => ({
    productId: c.productId,
    header: (counts.get(c.name) ?? 0) > 1 ? `${c.name} (${c.productId.slice(0, 4)})` : c.name,
  }));
}

export function buildEventSheets(
  event: PosEvent,
  allOrders: Order[],
  generatedAt: number,
  stats?: EventStats,
): EventSheets {
  const orders = allOrders.slice().sort((a, b) => a.seq - b.seq);
  const cols = productColumns(orders);
  const header: CellValue[] = [
    ...S.ordersHeadStart,
    ...cols.map((c) => c.header),
    ...S.ordersHeadEnd,
  ];
  const rows: CellValue[][] = orders.map((o) => {
    const qty = new Map(o.lines.map((l) => [l.productId, l.qty]));
    return [
      o.seq,
      formatDateTime(o.createdAt),
      statusLabel(o),
      o.status !== 'ok' && o.updatedAt ? formatDateTime(o.updatedAt) : '',
      ...cols.map((c) => qty.get(c.productId) ?? ''),
      centsToUnits(o.totalCents),
      centsToUnits(o.costCents),
      o.receivedCents !== undefined ? centsToUnits(o.receivedCents) : '',
    ];
  });
  const firstMoney = S.ordersHeadStart.length + cols.length;

  const st = stats ?? aggregate(orders, { floatCents: event.floatCents, now: generatedAt });
  const rate = (r: number | null) => (r === null ? '' : Math.round(r * 10000) / 10000);
  const summary: CellValue[][] = [[...S.summaryHeaders]];
  for (const c of st.categories) {
    for (const p of c.products) {
      summary.push([
        c.category,
        p.name,
        p.qty,
        centsToUnits(p.revenueCents),
        centsToUnits(p.costCents),
        centsToUnits(p.marginCents),
        rate(p.marginRate),
      ]);
    }
  }
  summary.push([
    S.total,
    '',
    st.itemsCount,
    centsToUnits(st.revenueCents),
    centsToUnits(st.costCents),
    centsToUnits(st.marginCents),
    rate(st.marginRate),
  ]);
  summary.push([]);
  summary.push([S.event, eventDisplayName(event)]);
  summary.push([S.ordersCount, st.ordersCount]);
  summary.push([S.itemsCount, st.itemsCount]);
  summary.push([S.average, centsToUnits(st.averageCents)]);
  summary.push([S.startingFloat, centsToUnits(st.floatCents)]);
  summary.push([S.expectedCash, centsToUnits(st.expectedCashCents)]);
  summary.push([S.generatedAt, formatDateTime(generatedAt)]);

  return {
    orders: [header, ...rows],
    summary,
    ordersMoneyColumns: [firstMoney, firstMoney + 1, firstMoney + 2],
  };
}
