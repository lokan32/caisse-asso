/** Default button palette (open question in design: any accessible set works). */
export const PALETTE = [
  '#E53935',
  '#C62828',
  '#FB8C00',
  '#F4B400',
  '#FDD835',
  '#7CB342',
  '#2E7D32',
  '#00897B',
  '#1E88E5',
  '#3949AB',
  '#8E24AA',
  '#795548',
  '#546E7A',
  '#EC407A',
];

export const DEFAULT_COLOR = '#1E88E5';

/** Black or white text, whichever contrasts best with the background. */
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#000';
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  // Contrast with white vs black.
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#fff' : '#000';
}

export function isHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s);
}
