import type { BrowserContext } from '@playwright/test';
import { FakeGoogle } from '../src/sync/testing/fake-google';

/** Stub of Google Identity Services: grants a token immediately. */
const GIS_STUB = `
window.google = { accounts: { oauth2: {
  initTokenClient: function (cfg) {
    return { requestAccessToken: function () {
      setTimeout(function () { cfg.callback({ access_token: window.__fakeToken || 'fake-token', expires_in: 3600 }); }, 10);
    } };
  },
  revoke: function (_t, done) { if (done) done(); }
} } };`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

/** Route Google sign-in and Drive/Sheets traffic of the whole context to an in-memory fake. */
export async function mockGoogle(
  context: BrowserContext,
  fake = new FakeGoogle(),
): Promise<FakeGoogle> {
  await context.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: GIS_STUB }),
  );
  await context.route(/^https:\/\/(www|sheets)\.googleapis\.com\//, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const raw = req.postData();
    const res = fake.handle(
      req.method(),
      req.url(),
      raw ? JSON.parse(raw) : undefined,
      req.headers()['authorization'] ?? null,
    );
    await route.fulfill({
      status: res.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(res.json ?? {}),
    });
  });
  return fake;
}
