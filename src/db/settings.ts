import { db } from './db';

export interface Settings {
  currency: string;
  changeStep: boolean;
  activeEventId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: '€',
  changeStep: true,
  activeEventId: null,
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value });
}
