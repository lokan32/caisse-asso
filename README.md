# Caisse Asso

A free cash register for associations (bars, snack stands, fundraisers), inspired by the flow of
"PoS Cash Register". It is an installable web app (PWA) with a French interface, works offline, and uses
the association's own **Google Drive** as its only storage. You don't need a server or pay for anything.

## Features

- **Prendre une commande**: one tab per category, a grid of colored product buttons, the running total,
  cash received and change.
- **Modifier les boutons**: categories and products (name, sale price, buy price, color, position).
- **Historique des commandes**: list, details, **edit** an order (it keeps its number and time) or **void** it.
- **Statistiques en direct**: revenue, orders, average basket, cost, margin, expected cash, per-product
  table and revenue per 30-minute slot. Computed on the device, instant, works offline.
- **Évènements**: start (date, name, starting cash float), resume, close.
- **Exporter**: Google sign-in and sync to Drive:
  - `POS/pos-config`: one tab per category (`ID | Nom | Prix de vente | Prix d'achat | Couleur | Position`);
  - `POS/event-YYYY-MM-DD`: tab **Commandes** (one row per order) and tab **Synthèse** (per-product
    result, totals, margins). Ready to read at the end of the event, with no manual editing.

Every order is saved on the device first and pushed to Google Sheets automatically when a connection is
available (after each change, when the connection returns, and with the "Synchroniser maintenant" button).
The device is the source of truth for events: manual edits in the event spreadsheets are overwritten at
the next sync.

## Google Cloud setup (once)

The app needs an OAuth **client ID** so it can sign in to Google from the browser. It's free, and you don't
need a billing account.

1. Open <https://console.cloud.google.com>, sign in, **New project** (e.g. `caisse-asso`).
2. **APIs & Services → Library**: enable **Google Sheets API** and **Google Drive API**.
3. **OAuth consent screen** (Google Auth Platform) → _Get started_: app name, support email,
   audience **External**, contact email.
   - **Audience → Test users**: add the Google accounts that will use the app while it's in _Testing_ mode.
   - **Data access → Add scopes**: `https://www.googleapis.com/auth/drive.file` (the app only sees the
     files it creates).
4. **Clients → Create client → Web application**. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (development)
   - `http://localhost:4173` (local preview of the build)
   - `https://<github-user>.github.io` (GitHub Pages, domain only, no path)

   Leave _Authorized redirect URIs_ empty. Copy the **Client ID**; you don't need the client secret.

While the app is in _Testing_ mode, Google shows "Google hasn't verified this app": click **Continue**.
To open it to everyone, click **Publish app** on the Audience page.

## Local development

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local      # then set VITE_GOOGLE_CLIENT_ID=<your client id>
npm run dev                     # http://localhost:5173
```

| Command           | What it does                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`     | Development server                                                                                                   |
| `npm run build`   | Type-check and production build in `dist/`                                                                           |
| `npm run preview` | Serve the build on <http://localhost:4173>                                                                           |
| `npm test`        | Unit tests (Vitest)                                                                                                  |
| `npm run e2e`     | End-to-end tests (Playwright, mobile viewport, Google APIs mocked). Run `npx playwright install chromium` once first |
| `npm run lint`    | ESLint                                                                                                               |

## Deploy to GitHub Pages

The workflow `.github/workflows/deploy.yml` runs the tests and publishes `dist/` on every push to `main`.

1. In the GitHub repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `VITE_GOOGLE_CLIENT_ID` = your client ID. (A client ID is not secret.)
3. Add `https://<github-user>.github.io` to the authorized JavaScript origins of the OAuth client.
4. Push to `main`. The app is published at `https://<github-user>.github.io/<repository>/`.

On a phone, open that address and use **Add to Home Screen** / **Install**. Open the app once while
online so it's available offline afterwards.

## Project layout

```
src/
  db/        IndexedDB (Dexie): catalog, events, orders, settings
  lib/       money (integer cents), French dates, aggregate() used by stats and the Synthèse sheet
  sync/      Google sign-in, Drive/Sheets client, sheet layouts, sync engine
  ui/        Preact screens and components
  i18n/fr.ts all French text, including spreadsheet names and headers
e2e/         Playwright tests
openspec/    specifications and the change plan
```
