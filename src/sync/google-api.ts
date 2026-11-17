/** Minimal Google Drive v3 / Sheets v4 client over fetch (no gapi). */

export const DRIVE = 'https://www.googleapis.com/drive/v3';
export const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class AuthError extends Error {
  constructor(message = 'Autorisation Google expirée') {
    super(message);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A configuration spreadsheet with the type's name already exists in Drive and this
 * device never synced with it:
 * the user must choose between importing it and replacing it.
 */
export class ConfigConflictError extends Error {
  constructor(
    public fileId: string,
    public typeId: string,
  ) {
    super('Un fichier pos-config existe déjà');
  }
}

export interface DriveFile {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
}

export type CellValue = string | number | boolean;

export class GoogleApi {
  constructor(
    private token: string,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      // 403 is also used for quota errors; only treat auth-related ones as AuthError.
      if (res.status === 401 || /auth|permission|scope|credential/i.test(text))
        throw new AuthError();
      throw new ApiError(res.status, text);
    }
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /* ---------- Drive ---------- */

  async about(): Promise<{ email: string }> {
    const r = await this.call<{ user?: { emailAddress?: string } }>(
      'GET',
      `${DRIVE}/about?fields=user(emailAddress)`,
    );
    return { email: r.user?.emailAddress ?? '' };
  }

  async listFiles(q: string): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,appProperties)',
      spaces: 'drive',
      pageSize: '1000',
    });
    const r = await this.call<{ files: DriveFile[] }>('GET', `${DRIVE}/files?${params}`);
    return r.files ?? [];
  }

  async createFile(meta: {
    name: string;
    mimeType: string;
    parents?: string[];
    appProperties?: Record<string, string>;
  }): Promise<DriveFile> {
    return this.call<DriveFile>('POST', `${DRIVE}/files?fields=id,name,appProperties`, meta);
  }

  /** Rename a file and/or set app properties (merged with the existing ones). */
  async updateFile(
    id: string,
    meta: { name?: string; appProperties?: Record<string, string> },
  ): Promise<DriveFile> {
    return this.call<DriveFile>(
      'PATCH',
      `${DRIVE}/files/${encodeURIComponent(id)}?fields=id,name,appProperties`,
      meta,
    );
  }

  /* ---------- Sheets ---------- */

  async getSheets(
    spreadsheetId: string,
  ): Promise<{ sheetId: number; title: string; index: number }[]> {
    const r = await this.call<{
      sheets: { properties: { sheetId: number; title: string; index: number } }[];
    }>('GET', `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title,index)`);
    return (r.sheets ?? []).map((s) => s.properties);
  }

  async batchUpdate(spreadsheetId: string, requests: unknown[]): Promise<{ replies?: unknown[] }> {
    if (requests.length === 0) return { replies: [] };
    return this.call('POST', `${SHEETS}/${spreadsheetId}:batchUpdate`, { requests });
  }

  async clearValues(spreadsheetId: string, ranges: string[]) {
    return this.call('POST', `${SHEETS}/${spreadsheetId}/values:batchClear`, { ranges });
  }

  async writeValues(spreadsheetId: string, data: { range: string; values: CellValue[][] }[]) {
    return this.call('POST', `${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
      valueInputOption: 'RAW',
      data,
    });
  }

  async readValues(spreadsheetId: string, ranges: string[]): Promise<CellValue[][][]> {
    const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
    for (const r of ranges) params.append('ranges', r);
    const r = await this.call<{ valueRanges?: { values?: CellValue[][] }[] }>(
      'GET',
      `${SHEETS}/${spreadsheetId}/values:batchGet?${params}`,
    );
    return (r.valueRanges ?? []).map((v) => v.values ?? []);
  }
}

/** A1 range: 'Ma feuille'!A1, or the whole sheet when a1 is ''. */
export function sheetRange(title: string, a1 = 'A1'): string {
  const quoted = `'${title.replace(/'/g, "''")}'`;
  return a1 ? `${quoted}!${a1}` : quoted;
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/** Drive query string literal. */
export function q(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function appPropQuery(key: string, value: string): string {
  return `appProperties has { key=${q(key)} and value=${q(value)} }`;
}
