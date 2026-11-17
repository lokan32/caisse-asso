/**
 * In-memory fake of the Drive v3 / Sheets v4 endpoints used by the app.
 * Test-only: used by unit tests (as a fetch) and by Playwright (via page.route).
 */

type Cell = string | number | boolean;

interface FakeSheet {
  sheetId: number;
  title: string;
  index: number;
  values: Cell[][];
}

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  trashed: boolean;
  sheets?: FakeSheet[];
  locale?: string;
}

export interface FakeResponse {
  status: number;
  json?: unknown;
}

let counter = 0;

export class FakeGoogle {
  files = new Map<string, FakeFile>();
  email = 'tresorier@example.org';
  token = 'fake-token';
  /** Number of upcoming requests that will fail (e.g. simulate a network drop mid-sync). */
  failNext = 0;
  failStatus = 503;
  requests: { method: string; url: string }[] = [];

  private nextSheetId = 1;

  // ---------- helpers for assertions ----------

  findByName(name: string): FakeFile | undefined {
    return [...this.files.values()].find((f) => f.name === name && !f.trashed);
  }

  sheetValues(fileName: string, sheetTitle: string): Cell[][] {
    const f = this.findByName(fileName);
    const sh = f?.sheets?.find((s) => s.title === sheetTitle);
    if (!sh) throw new Error(`No sheet ${fileName}/${sheetTitle}`);
    return sh.values.map((r) => r.slice());
  }

  sheetTitles(fileName: string): string[] {
    return (this.findByName(fileName)?.sheets ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((s) => s.title);
  }

  /** Simulate a manual edit in the Google Sheets UI. */
  setCell(fileName: string, sheetTitle: string, row: number, col: number, value: Cell) {
    const sh = this.findByName(fileName)?.sheets?.find((s) => s.title === sheetTitle);
    if (!sh) throw new Error('no sheet');
    while (sh.values.length <= row) sh.values.push([]);
    sh.values[row][col] = value;
  }

  /** Create a pos-config as if made by the app on another device. */
  seedConfig(tabs: { title: string; rows: Cell[][] }[]) {
    const folder = this.createFile({
      name: 'POS',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { posApp: 'folder' },
    });
    const f = this.createFile({
      name: 'pos-config',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folder.id],
      appProperties: { posApp: 'config' },
    });
    f.sheets = tabs.map((t, i) => ({
      sheetId: this.nextSheetId++,
      title: t.title,
      index: i,
      values: t.rows.map((r) => r.slice()),
    }));
    return f;
  }

  // ---------- request handling ----------

  handle(
    method: string,
    rawUrl: string,
    body?: unknown,
    authorization?: string | null,
  ): FakeResponse {
    this.requests.push({ method, url: rawUrl });
    if (authorization !== undefined && authorization !== `Bearer ${this.token}`) {
      return { status: 401, json: { error: { message: 'Invalid Credentials' } } };
    }
    if (this.failNext > 0) {
      this.failNext--;
      return { status: this.failStatus, json: { error: { message: 'Service unavailable' } } };
    }
    const url = new URL(rawUrl);
    const path = url.pathname;

    if (url.host === 'www.googleapis.com') {
      if (path === '/drive/v3/about')
        return { status: 200, json: { user: { emailAddress: this.email } } };
      if (path === '/drive/v3/files' && method === 'GET')
        return { status: 200, json: { files: this.query(url.searchParams.get('q') ?? '') } };
      if (path === '/drive/v3/files' && method === 'POST') {
        const f = this.createFile(body as Partial<FakeFile> & { name: string; mimeType: string });
        return { status: 200, json: { id: f.id, name: f.name, appProperties: f.appProperties } };
      }
    }

    if (url.host === 'sheets.googleapis.com') {
      const m =
        /^\/v4\/spreadsheets\/([^/:]+)(?::batchUpdate|\/values:(batchClear|batchUpdate|batchGet))?$/.exec(
          path,
        );
      const file = m && this.files.get(decodeURIComponent(m[1]));
      if (!m || !file?.sheets) return { status: 404, json: { error: { message: 'Not found' } } };
      if (path.endsWith(':batchUpdate') && !path.includes('/values'))
        return this.sheetsBatchUpdate(file, body as { requests: Record<string, unknown>[] });
      if (m[2] === 'batchClear') {
        for (const r of (body as { ranges: string[] }).ranges)
          this.sheetByRange(file, r).values = [];
        return { status: 200, json: {} };
      }
      if (m[2] === 'batchUpdate') {
        for (const d of (body as { data: { range: string; values: Cell[][] }[] }).data) {
          const { sheet, row, col } = this.parseRange(file, d.range);
          d.values.forEach((r, i) => {
            while (sheet.values.length <= row + i) sheet.values.push([]);
            r.forEach((v, j) => (sheet.values[row + i][col + j] = v));
          });
        }
        return { status: 200, json: {} };
      }
      if (m[2] === 'batchGet') {
        const ranges = url.searchParams.getAll('ranges');
        return {
          status: 200,
          json: {
            valueRanges: ranges.map((r) => {
              const { sheet, row } = this.parseRange(file, r);
              return { range: r, values: trimRows(sheet.values.slice(row)) };
            }),
          },
        };
      }
      return {
        status: 200,
        json: {
          sheets: file.sheets
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((s) => ({ properties: { sheetId: s.sheetId, title: s.title, index: s.index } })),
        },
      };
    }
    return { status: 404, json: { error: { message: `Unhandled ${method} ${rawUrl}` } } };
  }

  /** A fetch implementation backed by this fake. */
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const r = this.handle(
      init?.method ?? 'GET',
      String(input),
      init?.body ? JSON.parse(String(init.body)) : undefined,
      headers.get('Authorization'),
    );
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // ---------- internals ----------

  private createFile(meta: {
    name: string;
    mimeType: string;
    parents?: string[];
    appProperties?: Record<string, string>;
  }): FakeFile {
    const id = `file-${++counter}`;
    const f: FakeFile = {
      id,
      name: meta.name,
      mimeType: meta.mimeType,
      parents: meta.parents ?? [],
      appProperties: meta.appProperties ?? {},
      trashed: false,
    };
    if (meta.mimeType === 'application/vnd.google-apps.spreadsheet')
      f.sheets = [{ sheetId: 0, title: 'Feuille 1', index: 0, values: [] }];
    this.files.set(id, f);
    return f;
  }

  private query(q: string) {
    const props = [...q.matchAll(/appProperties has \{ key='([^']*)' and value='([^']*)' \}/g)].map(
      (m) => [m[1], m[2]],
    );
    const mime = /mimeType\s*=\s*'([^']*)'/.exec(q)?.[1];
    const parent = /'([^']*)' in parents/.exec(q)?.[1];
    const notTrashed = /trashed\s*=\s*false/.test(q);
    return [...this.files.values()]
      .filter((f) => props.every(([k, v]) => f.appProperties[k] === v))
      .filter((f) => !mime || f.mimeType === mime)
      .filter((f) => !parent || f.parents.includes(parent))
      .filter((f) => !notTrashed || !f.trashed)
      .map((f) => ({ id: f.id, name: f.name, appProperties: f.appProperties }));
  }

  private sheetsBatchUpdate(
    file: FakeFile,
    body: { requests: Record<string, unknown>[] },
  ): FakeResponse {
    const replies: unknown[] = [];
    const sheets = file.sheets!;
    for (const req of body.requests) {
      const [kind, arg] = Object.entries(req)[0] as [string, Record<string, unknown>];
      if (kind === 'addSheet') {
        const props = (arg.properties ?? {}) as { title: string; index?: number };
        if (sheets.some((s) => s.title === props.title))
          return { status: 400, json: { error: { message: 'duplicate title' } } };
        const sh: FakeSheet = {
          sheetId: this.nextSheetId++,
          title: props.title,
          index: props.index ?? sheets.length,
          values: [],
        };
        for (const s of sheets) if (s.index >= sh.index) s.index++;
        sheets.push(sh);
        this.reindex(sheets);
        replies.push({
          addSheet: { properties: { sheetId: sh.sheetId, title: sh.title, index: sh.index } },
        });
      } else if (kind === 'deleteSheet') {
        if (sheets.length === 1)
          return { status: 400, json: { error: { message: 'cannot delete last sheet' } } };
        const i = sheets.findIndex((s) => s.sheetId === arg.sheetId);
        if (i < 0) return { status: 400, json: { error: { message: 'no sheet' } } };
        sheets.splice(i, 1);
        this.reindex(sheets);
        replies.push({});
      } else if (kind === 'updateSheetProperties') {
        const props = arg.properties as { sheetId: number; title?: string; index?: number };
        const sh = sheets.find((s) => s.sheetId === props.sheetId);
        if (!sh) return { status: 400, json: { error: { message: 'no sheet' } } };
        if (props.title !== undefined) sh.title = props.title;
        if (props.index !== undefined) {
          const ordered = sheets
            .slice()
            .sort((a, b) => a.index - b.index)
            .filter((s) => s !== sh);
          ordered.splice(Math.min(props.index, ordered.length), 0, sh);
          ordered.forEach((s, k) => (s.index = k));
        }
        replies.push({});
      } else if (kind === 'updateSpreadsheetProperties') {
        file.locale = ((arg.properties ?? {}) as { locale?: string }).locale;
        replies.push({});
      } else {
        // Formatting requests (repeatCell, …) are accepted and ignored.
        replies.push({});
      }
    }
    return { status: 200, json: { replies } };
  }

  private reindex(sheets: FakeSheet[]) {
    sheets.sort((a, b) => a.index - b.index).forEach((s, k) => (s.index = k));
  }

  private parseRange(file: FakeFile, range: string) {
    const m = /^'((?:[^']|'')*)'!([A-Z]+)(\d+)/.exec(range) ?? /^([^!]+)!([A-Z]+)(\d+)/.exec(range);
    if (!m) throw new Error(`Bad range ${range}`);
    const title = m[1].replace(/''/g, "'");
    const sheet = file.sheets!.find((s) => s.title === title);
    if (!sheet) throw new Error(`Unknown sheet ${title}`);
    const col = [...m[2]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    return { sheet, row: Number(m[3]) - 1, col };
  }

  private sheetByRange(file: FakeFile, range: string): FakeSheet {
    const title = (/^'((?:[^']|'')*)'/.exec(range)?.[1] ?? range.split('!')[0]).replace(/''/g, "'");
    const sheet = file.sheets!.find((s) => s.title === title);
    if (!sheet) throw new Error(`Unknown sheet ${title}`);
    return sheet;
  }
}

function trimRows(rows: Cell[][]): Cell[][] {
  const out = rows.map((r) => {
    const copy = r.slice();
    while (copy.length && (copy[copy.length - 1] === undefined || copy[copy.length - 1] === ''))
      copy.pop();
    return copy.map((v) => (v === undefined ? '' : v));
  });
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out;
}
