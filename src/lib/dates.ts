const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export function isoDate(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11-21" → "21/11/2026". */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Timestamp → "21/11/2026". */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Timestamp → "20:05" (24 h). */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Timestamp → "21/11/2026 20:05". */
export function formatDateTime(ms: number): string {
  return `${formatDate(ms)} ${formatTime(ms)}`;
}

/** Start of the local clock-aligned slot containing ms (e.g. 20:17 → 20:00 for 30 min). */
export function slotStart(ms: number, slotMinutes: number): number {
  const d = new Date(ms);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const start = Math.floor(minutes / slotMinutes) * slotMinutes;
  d.setHours(Math.floor(start / 60), start % 60, 0, 0);
  return d.getTime();
}
