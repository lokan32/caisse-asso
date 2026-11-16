# Tasks

## 1. Project setup

- [ ] 1.1 Scaffold a Vite + TypeScript + Preact app with ESLint/Prettier and Vitest; verify `npm run build` and `npm test` succeed on the empty app
- [ ] 1.2 Add `vite-plugin-pwa` with manifest (name, icons, standalone display) and precaching service worker; verify Lighthouse reports the app installable and a reload with DevTools "Offline" still loads the app
- [ ] 1.3 Add hash router with placeholder screens (`#/`, `#/order`, `#/edit`, `#/history`, `#/stats`, `#/settings`, `#/export`); verify each route renders and has a back-to-home control
- [ ] 1.4 Add Playwright for end-to-end tests with a mobile viewport; verify a smoke test opening the home screen passes
- [ ] 1.5 Create the French strings module (`fr.ts`, incl. sheet names/headers), set `lang="fr"` and a French manifest, and use French labels on the home entries ("Prendre une commande", "Modifier les boutons", "Historique des commandes", "Paramètres", "Exporter"); verify the smoke test asserts the French labels

## 2. Data layer

- [ ] 2.1 Define Dexie schema (categories, products, events, orders, settings, syncState) with schema versioning and call `navigator.storage.persist()`; verify with a unit test using fake-indexeddb that records round-trip
- [ ] 2.2 Implement money and date helpers (integer cents, parse user input with `,` or `.`, French formatting "6,50 €", DD/MM/YYYY, 24 h times); verify unit tests for parsing "1,50"/"1.50", rejecting negatives/non-numeric, and French formatting
- [ ] 2.3 Implement the pure `aggregate(orders, slotMinutes)` function (headline figures, per-product rows, category subtotals, time slots, expected cash, voided orders excluded, modified orders counted with their latest content); verify unit tests covering the margin scenario (200/80 → 120, 60%), voids, edited orders, and the 30-min slot scenario from the live-stats spec

## 3. Product catalog and Edit buttons

- [ ] 3.1 Implement catalog repository (CRUD categories/products, position reorder, default color, next free position, mark catalog dirty); verify unit tests for create-with-defaults and repositioning shifts other products
- [ ] 3.2 Build the Edit buttons screen: category tabs, grid preview, add/edit/delete product form with validation, color picker from a fixed accessible palette, move/reorder, category create/rename/reorder/delete with confirmation; verify Playwright test creating a category and a product, then moving it to position 1
- [ ] 3.3 Seed an example catalog on first launch when empty (e.g. Drinks/Food) that the user can delete; verify a fresh install shows the example grid

## 4. Events

- [ ] 4.1 Implement event repository (start with date, label, starting float; single active event; switch; close as read-only; spreadsheet name with `-n` suffix resolved at sync); verify unit tests for start/switch/close rules
- [ ] 4.2 Add event management UI in Settings (start, switch, close with confirmation) and the "no active event" prompt on Take order; verify Playwright test starting an event and seeing its name on home

## 5. Order taking

- [ ] 5.1 Build the order screen: category tabs, colored product buttons with price and quantity badge, current order panel (lines, decrease/remove, clear, total), responsive phone/tablet layout; verify Playwright test of the "Beer x2 + Chips x1 = 6.00" scenario
- [ ] 5.2 Build the cash received / change dialog (exact amount, next banknotes, keypad, refusal when insufficient, showing missing amount), skippable via the setting; verify Playwright tests for 10 → change 4.00 and 5 → refused
- [ ] 5.3 Record orders with snapshot lines, per-event `seq`, UUID, cents totals and cost, and reset for next order; refuse empty orders; verify unit test of the stored record and a Playwright test recording an order with network offline

## 6. Order history

- [ ] 6.1 Build the history list (newest first, #, time, total, items, sync status, "annulée"/"modifiée" badges) and order detail view (incl. last edit time); verify Playwright test listing recorded orders and opening one
- [ ] 6.2 Implement void with confirmation (disabled for closed events), marking the event dirty; verify a test that voiding a 6.00 order lowers live revenue by 6.00 and that closed events show no void action
- [ ] 6.3 Implement order editing: edit mode of the order screen pre-filled from the stored order, keep `seq`/`createdAt` and existing line prices, set `updatedAt` and status `modified`, refuse saving an empty order (offer void), show the amount to collect or give back, disabled for closed events and voided orders, mark the event dirty; verify unit tests for price retention and Playwright tests for the "Beer x2 → Beer x1 + Coffee x1 = 4,00 €" scenario, the 1,50 € to collect scenario, and live stats updating after the edit

## 7. Live stats

- [ ] 7.1 Build the live stats screen on `liveQuery` + `aggregate`: headline tiles, per-product table with sort (quantity/revenue/margin) and category grouping, expected cash; verify Playwright test that confirming an order updates the screen without reload
- [ ] 7.2 Add the revenue-per-30-min SVG bar chart and last-30-min revenue; verify a unit test of slot bucketing and a visual check on a seeded event
- [ ] 7.3 Add the home-screen live summary (revenue, orders) linking to stats, also reachable from the order screen; verify Playwright test

## 8. Google account and Sheets sync

- [ ] 8.1 Integrate Google Identity Services token client with `drive.file` scope (connect, disconnect, silent refresh, reconnect banner) and show account email in Settings; verify manually against a test Google Cloud OAuth client
- [ ] 8.2 Implement Drive helpers via fetch: find/create "POS" folder and app files by `appProperties`, unique event spreadsheet naming; verify unit tests with a mocked fetch for find-existing vs create and the `-2` suffix case
- [ ] 8.3 Implement `pos-config` writer (one tab per category, sanitized tab names, French header `ID | Nom | Prix de vente | Prix d'achat | Couleur | Position` + rows, delete obsolete tabs) and importer (replace catalog after confirmation, skip and report invalid rows); verify unit tests on generated values/requests and on importing a sheet with one bad row
- [ ] 8.4 Implement event writer with French names: Commandes tab (columns by first sale, Statut OK/MODIFIÉE/ANNULÉE, Modifiée à, Total, Coût, Montant reçu) and Synthèse tab from `aggregate`, spreadsheet locale fr_FR, full rewrite with trailing rows cleared; verify unit tests that Synthèse values equal `aggregate` output, that an edited order keeps a single row with status MODIFIÉE, and that writing twice yields identical content (idempotence)
- [ ] 8.5 Implement the sync engine: dirty flags + revision counters, mutex, debounce 5 s, triggers (change, `online`, foreground, Export, event close), exponential backoff, pending-orders counter; verify unit tests for "revision changed during upload keeps dirty" and retry-after-failure with no duplication
- [ ] 8.6 Build the Export screen (connect, Sync now, result with link to spreadsheet or error + pending count, import catalog, note that manual sheet edits are overwritten) and the home sync indicator; verify Playwright test with mocked Google APIs covering offline → online sync of 15 orders and pending counter back to 0

## 9. Settings and documentation

- [ ] 9.1 Complete Settings: currency symbol, change step toggle, account, events; verify Playwright test that changing the currency symbol updates prices and stats
- [ ] 9.2 Write README: features, Google Cloud project setup (enable Sheets + Drive APIs, OAuth consent screen, client ID, authorized origin), `VITE_GOOGLE_CLIENT_ID`, local dev, deploy to GitHub Pages; verify a fresh clone builds following the README
- [ ] 9.3 Add a GitHub Pages deploy workflow (build + publish); verify the deployed URL loads and installs

## 10. End-to-end verification

- [ ] 10.1 Run a full event rehearsal on a real phone: start event with float, record ~30 orders partly offline, edit one, void one, check live stats, reconnect, close event; verify the event spreadsheet's Synthèse matches live stats exactly and no order is duplicated or missing
- [ ] 10.2 Validate the change with `openspec validate add-pos-pwa --strict`; verify it passes

## Workflow follow-up

- Archive the change once implementation is reviewed and the rehearsal succeeded.
