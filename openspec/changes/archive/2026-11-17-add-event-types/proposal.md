# Proposal

## Why

An association does not sell the same things at every event: some products are only offered at the Kermesse, and prices can differ from one kind of event to another. Today the app has a single global catalog, so the user has to rework the buttons before each event and loses the previous setup. Making the button configuration depend on a reusable **event type** lets each kind of event keep its own products and prices.

## What Changes

- Introduce **event types** (e.g. "Kermesse", "Marché de Noël"): named, each owning its own button configuration (categories, products, prices, colors, positions).
- The user can create, rename and delete event types. When creating a type, the user picks a source: start from an empty configuration, or copy the configuration of an existing type. The copy is independent afterwards.
- **BREAKING (behavior)**: starting an event requires choosing an event type. The order screen shows the configuration of the active event's type.
- The "Edit buttons" screen edits the configuration of one event type (the active event's type by default, with a selector for the others). Changes apply to every open event of that type; recorded orders keep their prices (unchanged rule).
- Deleting an event type is only allowed when no open event uses it.
- Google Sheets: the single `pos-config` spreadsheet is replaced by one spreadsheet per event type, `pos-config-<type name>`, with the same tab/column layout. Import is done per type.
- Migration: on upgrade, the existing catalog becomes a first event type (named "Général"), existing events are attached to it, and its existing `pos-config` spreadsheet is reused for it.
- Event types and configurations are managed in Settings (new "Types d'évènement" section).

## Capabilities

### New Capabilities
- `event-types`: event types as named, reusable button configurations; creating (empty or copied from an existing type), renaming and deleting types; migration of the existing catalog into a first type.

### Modified Capabilities
- `event-management`: starting an event requires an event type; events display and keep their type.
- `product-catalog`: the catalog is scoped to an event type instead of being global; "Edit buttons" edits a selected type's configuration.
- `order-taking`: the product grid shows the configuration of the active event's type.
- `google-sheets-sync`: one `pos-config-<type name>` spreadsheet per event type; drive folder content, layout, import and conflict rules updated accordingly.
- `app-shell`: Settings manages event types in addition to events.

## Impact

- Data model (`src/db/types.ts`, `src/db/db.ts`): new `EventType` table, `typeId` on `Category` (products inherit via category) and on `PosEvent`; Dexie schema version 2 with an upgrade migration.
- Catalog API (`src/db/catalog.ts`): all functions scoped by type id; new copy operation; per-type sync dirty state.
- Events API (`src/db/events.ts`): `startEvent` takes a type id.
- Sync (`src/sync/sync-ops.ts`, `sheets-layout.ts`, `engine.ts`, `index.ts`, `google-api.ts`): per-type config spreadsheets, Drive file rename on type rename, per-type import and conflict handling.
- UI: Settings (types section, type selector in start-event form), Edit (type selector), Order (filtered by active type), Export (per-type import), pending indicator.
- i18n strings (`src/i18n/fr.ts`), unit tests and Playwright e2e tests.
