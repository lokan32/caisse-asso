# Proposal

## Why

Associations running events (bars, snack stands, fundraisers) need a free, simple cash register that volunteers can use on any phone or tablet, and they need the event's financial result (revenue, cost, margin per product) available immediately at the end without hand-editing spreadsheets. During the event, organizers also need live figures to know where they stand (revenue so far, best sellers, stock-relevant quantities).

## What Changes

- New installable, offline-first PWA cash register with a French user interface (French labels, "1,50 €" amounts, DD/MM/YYYY dates), inspired by the flow of "PoS Cash Register" (ml.mixxamm.poscashregister): a grid of colored product buttons, tap to add to the current order, see the total, enter cash received and see change, validate.
- Home screen with five entries: **Take order**, **Edit buttons**, **Order history**, **Settings**, **Export / Sync with Google account**. A live-stats summary is reachable from the home screen and from the order screen.
- Product catalog organized by category (one tab per category on the order screen), each product with name, sale price, buy price, color and grid position; editable in the app ("Edit buttons").
- Event lifecycle: start an event (by start date), take orders against it, close it.
- Order history for the current event, with the ability to edit an order to fix mistakes (keeping its number and time) or to cancel (void) it.
- **Live stats** for the current event, computed locally and updated after every order: revenue, number of orders, average basket, cost, margin, and per-product quantities/revenue/margin, plus revenue over time.
- Google Drive as the only backend: sign in with Google; the app maintains
  - `pos-config` spreadsheet: one sheet per category, one row per product (name, sale price, buy price, color, position);
  - `event-<start date>` spreadsheet per event: sheet 1 "Commandes" = one row per order (time, status, per-product quantities, order amount); sheet 2 "Synthèse" = per-product summary (quantity, revenue, cost, margin) plus totals, ready to read with no manual editing. Sheet and column names are in French.
- Offline-first: every order, edit and void is stored on the device first; sync pushes pending data to Google Sheets when online (automatically and via the Export button).
- Out of scope: ticket/receipt printing, card payments, multi-device shared live stats, user accounts other than the Google account, stock management, VAT reporting.

## Capabilities

### New Capabilities
- `app-shell`: installable offline PWA, French UI and formatting, home screen navigation (5 entries), settings (Google account, currency, active event).
- `product-catalog`: categories and products (name, sale price, buy price, color, grid position) and the "Edit buttons" editor.
- `order-taking`: building an order from the product grid, total, cash received and change, validating or clearing an order.
- `event-management`: starting, selecting and closing an event that orders are attached to.
- `order-history`: listing the current event's orders, editing an order to fix mistakes, and voiding an order.
- `live-stats`: real-time event statistics computed on the device.
- `google-sheets-sync`: Google sign-in, the `pos-config` and `event-<date>` spreadsheet layouts, and offline-first synchronization between device and Drive.

### Modified Capabilities
- None (greenfield project).

## Impact

- New codebase (greenfield): a static web app (PWA) with local persistence (IndexedDB) and a service worker.
- External dependencies: Google Identity Services (OAuth in the browser), Google Sheets API v4 and Google Drive API v3 with the `drive.file` scope (app only touches files it created).
- Requires a Google Cloud project with an OAuth client ID for the hosting origin; hosting on a free static host (e.g. GitHub Pages).
- Assumptions recorded: a single device per event takes orders (live stats are local to that device); cash is the payment method (change calculation), other payment types may be tagged but not processed.
