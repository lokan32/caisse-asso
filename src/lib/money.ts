const NBSP = '\u00a0';
const numberFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Parse an amount typed by the user ("1,50", "1.50", "2", "1 250,00 €") into integer cents.
 * Returns null for empty, non-numeric or negative input, or more than 2 decimals.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f€$£]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned) && !/^\d*\.\d{1,2}$/.test(cleaned)) return null;
  const [intPart, decPart = ''] = cleaned.split('.');
  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Format cents in French style: 650 → "6,50 €" (non-breaking space). */
export function formatMoney(cents: number, symbol = '€'): string {
  const s = numberFormat.format(cents / 100).replace(/\u202f/g, NBSP);
  return symbol ? `${s}${NBSP}${symbol}` : s;
}

/** Cents → number of currency units, for spreadsheets. */
export function centsToUnits(cents: number): number {
  return Math.round(cents) / 100;
}

/** Cents → value shown in an input field ("1,50"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
