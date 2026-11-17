import { expect, test } from 'vitest';
import { parseHash } from './router';

test('parses routes', () => {
  expect(parseHash('').name).toBe('');
  expect(parseHash('#/').name).toBe('');
  expect(parseHash('#/history/abc')).toMatchObject({ name: 'history', params: ['abc'] });
  expect(parseHash('#/order?edit=42').query.get('edit')).toBe('42');
  expect(parseHash('#/edit?type=abc-123')).toMatchObject({ name: 'edit', params: [] });
  expect(parseHash('#/edit?type=abc-123').query.get('type')).toBe('abc-123');
});
