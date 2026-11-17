import { describe, expect, test } from 'vitest';
import { centsToInput, formatMoney, parseAmount } from './money';
import { formatDate, formatDateTime, formatIsoDate, formatTime, isoDate, slotStart } from './dates';

describe('parseAmount', () => {
  test('accepts comma or dot decimals', () => {
    expect(parseAmount('1,50')).toBe(150);
    expect(parseAmount('1.50')).toBe(150);
    expect(parseAmount('1,5')).toBe(150);
    expect(parseAmount('2')).toBe(200);
    expect(parseAmount(',5')).toBe(50);
    expect(parseAmount(' 1 250,00 € ')).toBe(125000);
    expect(parseAmount('0')).toBe(0);
  });
  test('rejects negative, non-numeric and empty input', () => {
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1,234')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
  });
});

describe('French formatting', () => {
  test('money', () => {
    expect(formatMoney(650)).toBe('6,50\u00a0€');
    expect(formatMoney(0)).toBe('0,00\u00a0€');
    expect(formatMoney(125000)).toBe('1\u00a0250,00\u00a0€');
    expect(formatMoney(150, 'CHF')).toBe('1,50\u00a0CHF');
    expect(centsToInput(150)).toBe('1,50');
  });
  test('dates and times', () => {
    const t = new Date(2026, 10, 21, 20, 5).getTime();
    expect(formatDate(t)).toBe('21/11/2026');
    expect(formatTime(t)).toBe('20:05');
    expect(formatDateTime(t)).toBe('21/11/2026 20:05');
    expect(isoDate(t)).toBe('2026-11-21');
    expect(formatIsoDate('2026-11-21')).toBe('21/11/2026');
  });
  test('slots align to the clock', () => {
    const t = new Date(2026, 10, 21, 20, 47, 12).getTime();
    expect(slotStart(t, 30)).toBe(new Date(2026, 10, 21, 20, 30).getTime());
  });
});
