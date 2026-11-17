import { db } from '../db/db';
import { AuthError, GoogleApi } from './google-api';

/**
 * Google Identity Services token client (browser-only OAuth, no client secret).
 * Scope drive.file: the app only sees files it created.
 */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const KEY = 'google';

export interface GoogleAccount {
  email: string;
  token?: string;
  expiresAt?: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

export const clientId: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

let gisPromise: Promise<Gis> | null = null;

function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  gisPromise ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () =>
      window.google
        ? resolve(window.google)
        : reject(new Error('Google Identity Services indisponible'));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Impossible de charger Google Identity Services (hors ligne ?)'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function requestToken(
  prompt: '' | 'consent' | 'select_account',
  hint?: string,
): Promise<{ token: string; expiresAt: number }> {
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID manquant');
  const gis = await loadGis();
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token)
          return reject(new AuthError(r.error_description ?? r.error ?? 'Connexion refusée'));
        resolve({
          token: r.access_token,
          expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000,
        });
      },
      error_callback: (e) => reject(new AuthError(e.message ?? e.type)),
    });
    client.requestAccessToken({ prompt, ...(hint ? { login_hint: hint } : {}) });
  });
}

export async function getAccount(): Promise<GoogleAccount | null> {
  return ((await db.settings.get(KEY))?.value as GoogleAccount | undefined) ?? null;
}

async function saveAccount(a: GoogleAccount | null) {
  if (a) await db.settings.put({ key: KEY, value: a });
  else await db.settings.delete(KEY);
}

/** Must be called from a user gesture (click): may open the Google popup. */
export async function connect(): Promise<GoogleAccount> {
  const existing = await getAccount();
  const { token, expiresAt } = await requestToken(
    existing?.email ? '' : 'select_account',
    existing?.email,
  );
  const { email } = await new GoogleApi(token).about();
  const account = { email, token, expiresAt };
  await saveAccount(account);
  return account;
}

export async function disconnect() {
  const a = await getAccount();
  if (a?.token) {
    try {
      (await loadGis()).accounts.oauth2.revoke(a.token);
    } catch {
      // Offline: the token will simply expire.
    }
  }
  await saveAccount(null);
}

/** Forget the token but keep the account (it expired or was rejected). */
export async function invalidateToken() {
  const a = await getAccount();
  if (a) await saveAccount({ email: a.email });
}

export function tokenValid(
  a: GoogleAccount | null,
  now = Date.now(),
): a is GoogleAccount & { token: string } {
  return !!a?.token && (a.expiresAt ?? 0) - 60_000 > now;
}
