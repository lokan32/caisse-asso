# Design

## Context

Greenfield project: the folder holds only `specs.txt` (the user's draft) and tooling config. See proposal.md for motivation and specs/ for the behavior contract. Constraints that shape the approach:

- Free for associations: no paid backend, no server to run. Google Drive (the association's own account) is the only storage.
- Runs on whatever volunteers have (Android/iOS phones, tablets, laptops) → web PWA.
- Event venues often have poor connectivity → offline-first; one device takes orders per event, so there is no multi-writer conflict to solve.
- Live stats must be instant and work offline → computed on the device, never read back from Sheets.

## Goals / Non-Goals

**Goals:**
- A static app (HTML/JS/CSS) deployable on a free static host, with no backend code.
- Local database as the single source of truth for events; Sheets is a derived, always-regenerable export.
- Simple, deterministic, idempotent sync that is easy to reason about.

**Non-Goals:**
- Real-time multi-device sync, merging edits made on two devices.
- Two-way merging of `pos-config` (import is an explicit, replacing action).
- Reading event data back from Sheets into the app.
- Multi-language UI: v1 is French only (see D11); no language switcher.

## Decisions

### D1. Stack: Vite + TypeScript + Preact, vite-plugin-pwa
- Preact (React API, ~4 kB) keeps the bundle small for cheap phones; TypeScript for the money/sync logic.
- `vite-plugin-pwa` (Workbox) generates the manifest and a precache service worker so the app shell loads offline.
- Alternatives: plain JS (harder to maintain once the editor and stats grow), React (heavier for no gain), Flutter/native (rejected by the user in favor of PWA).

### D2. Local storage: IndexedDB via Dexie
- Tables: `categories`, `products`, `events`, `orders`, `settings`, `syncState`.
- Dexie `liveQuery` gives reactive queries, so live stats and the history refresh automatically on every write (spec: stats update without manual refresh).
- Call `navigator.storage.persist()` at startup to reduce the risk of the browser evicting data.
- Alternative: localStorage, rejected (size limit, synchronous, no indexes).

### D3. Money as integer cents
All prices and totals are stored and computed in integer cents; formatting divides by 100 at display/export time. Avoids floating-point drift that would make live stats differ from the Synthèse sheet.

### D4. Order snapshot model
An order stores `{id (UUID), eventId, seq (per-event 1..n), createdAt, updatedAt?, status: 'ok'|'modified'|'voided', lines: [{productId, name, category, qty, unitPriceCents, unitCostCents}], totalCents, costCents, receivedCents?}`. Snapshotting name/prices satisfies "past orders independent of catalog changes". `seq` is the human "N° commande".

Editing an order (see order-history spec) replaces its `lines` and totals in place: `id`, `seq` and `createdAt` are unchanged, `updatedAt` is set and `status` becomes `modified`. Existing lines keep their snapshot prices; lines for products added during the edit snapshot current catalog prices. No edit log is kept in v1: the spreadsheet shows the latest content and the edit time, which is enough for an association's treasurer. Alternative considered: void + re-create a new order, rejected because it changes the order number and clutters the history.

### D5. Shared aggregation function
One pure function `aggregate(orders, slotMinutes)` produces headline figures, per-product rows, category subtotals and time slots. It is used by both the live stats screen and the Synthèse sheet writer, which guarantees the "stats consistent with event spreadsheet" requirement and is the main unit-tested module.

### D6. Google auth: Google Identity Services token client, `drive.file` scope
- Browser-only OAuth (no backend, no client secret). Access tokens last ~1 h; the app requests a new one silently when needed and falls back to a button ("Reconnect") when a user gesture is required.
- `drive.file` is a non-sensitive scope: no Google security audit, and the app can only see files it created. Files are tagged with `appProperties` (`posApp=config` / `posApp=event`, `eventId=<uuid>`) so the app finds its files again on a new device or after reinstall via `files.list`.
- Sheets API v4 and Drive API v3 called with `fetch` directly (no `gapi` client library), keeping the bundle small.
- Alternative: Apps Script web app as backend, rejected (each association would need to deploy a script; quotas; harder offline story).

### D7. Sync = full regeneration of dirty spreadsheets
- Each event and the catalog carry a `dirty` flag (and a local revision counter) set by any change. A sync pass, for each dirty item: ensure the file exists (create or find by `appProperties`), ensure sheets/tabs exist (`spreadsheets.batchUpdate`), then **rewrite** the full contents with `values.batchUpdate` + clear of trailing rows. The dirty flag is cleared only if the local revision did not change during the upload.
- Why full rewrite rather than appending rows: it is naturally idempotent (retries can never duplicate rows, which satisfies the "Idempotent synchronization" spec), handles edits, voids and new product columns trivially, and the volume is small (an event of 2,000 orders × 40 columns ≈ 80k cells, well within one request's limits).
- Triggers: debounced 5 s after a change, `online` event, app foreground, Export button, event close. A single in-flight sync at a time (mutex); exponential backoff on errors.
- "Pending orders" counter = orders created/voided after the event's last successful sync revision.
- Alternative: append-only rows keyed by row index, rejected for v1 as more complex for little benefit at this scale.

### D8. Spreadsheet layouts
- `POS/pos-config`: one tab per category (tab order = category order), columns `ID | Nom | Prix de vente | Prix d'achat | Couleur | Position`. Prices written as numbers with a euro currency format (the spreadsheet locale is set to fr_FR at creation so decimals show with a comma); colors as `#RRGGBB`. Tab names sanitized (Sheets forbids some characters and limits length); the category's real name is kept in the app.
- `POS/event-YYYY-MM-DD[-n]`: tab `Commandes` (`N° commande | Heure | Statut | Modifiée à | <product columns…> | Total | Coût | Montant reçu`, Statut ∈ OK/MODIFIÉE/ANNULÉE), product columns in order of first sale, header shows product name (suffixed with ID fragment only if two products share a name); tab `Synthèse` (per-product `Catégorie | Produit | Quantité | Chiffre d'affaires | Coût | Marge | Marge %`, `Total` row, then the headline figures block). Values written by the app, not formulas, so the sheet always matches live stats exactly.
- Spreadsheet name chosen at first sync; uniqueness checked with `files.list` among app files.

### D9. UI structure
Hash-based routing (works on any static host and offline): `#/` home, `#/order`, `#/edit`, `#/history`, `#/stats`, `#/settings`, `#/export`. Editing an order reuses the order screen in an "edit mode" (current order pre-filled from the stored order, banner "Modification de la commande n°7", Save/Cancel instead of Encaisser); the cash step shows only the difference to collect or give back. The order screen is optimized for one-hand use on a phone in portrait and a two-pane layout (grid + current order) on tablets. The change dialog offers: exact amount, and the next banknotes above the total (5, 10, 20, 50) plus a numeric keypad.

### D10. Live stats screen
Headline tiles (revenue, orders, items, average order, cost, margin, expected cash), a per-product table with sort and category grouping, and a bar chart of revenue per 30-min slot drawn as inline SVG (no chart library needed for one bar chart).

### D11. French UI and formatting
All UI strings live in one module (`src/i18n/fr.ts`) referenced by key, so wording can be reviewed in one place and another language added later without touching screens. Amounts use `Intl.NumberFormat('fr-FR', {style:'currency'})` with the currency symbol from Settings, dates/times `Intl.DateTimeFormat('fr-FR')`. The amount parser accepts `,` or `.` as decimal separator. `<html lang="fr">` and the PWA manifest are in French. Spreadsheet sheet names and headers are French constants defined in the same module.
Alternative: an i18n library (i18next), rejected as unnecessary weight for a single language.

### D12. Hosting
GitHub Pages (or any static host) over HTTPS. The OAuth client ID is a build-time variable (`VITE_GOOGLE_CLIENT_ID`); the authorized JavaScript origin must match the host. A README documents creating the Google Cloud project, enabling Sheets + Drive APIs and configuring the consent screen.

## Risks / Trade-offs

- [Browser clears IndexedDB (storage pressure, iOS 7-day eviction for non-installed sites)] → request persistent storage, encourage installing the PWA, sync whenever online, show a warning when unsynced data is old.
- [Token expiry needs a user gesture on some browsers] → sync never blocks order taking; show a "Reconnect" banner; data stays queued.
- [Full rewrite becomes slow for very large events] → acceptable for association events; if needed later, switch the Commandes tab to append+update by row index without changing specs.
- [Sheets API quota (60 write requests/min/user)] → debounce + one sync at a time keeps usage to a few requests per minute.
- [User edits pos-config in Sheets and also in the app] → import is explicit and replaces the device catalog after confirmation; the app's next sync overwrites pos-config otherwise. Documented on the Export screen.
- [Single device only] → live stats from several cashiers would need a shared backend; out of scope, recorded in proposal.
- [Google OAuth consent screen in "testing" mode limits to 100 test users] → publish the app (non-sensitive scope, light verification) before wider distribution.

## Migration Plan

Greenfield: no migration. Deploy = build static files and publish to the host. Rollback = redeploy previous build; local data schema is versioned with Dexie so future schema changes get upgrade functions.

## Open Questions

- Default color palette for product buttons (any accessible set of ~12 colors works).
