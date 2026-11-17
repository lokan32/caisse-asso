import { expect, test } from 'vitest';
import { GoogleApi, SPREADSHEET_MIME } from './google-api';
import { FakeGoogle } from './testing/fake-google';

test('updateFile renames a file and merges app properties', async () => {
  const fake = new FakeGoogle();
  const api = new GoogleApi(fake.token, fake.fetch);
  const f = await api.createFile({
    name: 'pos-config',
    mimeType: SPREADSHEET_MIME,
    appProperties: { posApp: 'config' },
  });
  const updated = await api.updateFile(f.id, {
    name: 'pos-config-Général',
    appProperties: { typeId: 't1' },
  });
  expect(updated).toEqual({
    id: f.id,
    name: 'pos-config-Général',
    appProperties: { posApp: 'config', typeId: 't1' },
  });
  expect(fake.findByName('pos-config-Général')).toBeDefined();
  expect(fake.findByName('pos-config')).toBeUndefined();
  await expect(api.updateFile('missing', { name: 'x' })).rejects.toThrow();
});
