# Tasks

## 1. Data model and migration

- [x] 1.1 Add `EventType` to `src/db/types.ts`, `typeId` to `Category` and `PosEvent`, and `syncedName?` to `SyncState`; verify `npm run build` type-checks (fix call sites later groups touch with temporary values only if needed)
- [x] 1.2 Add Dexie `version(2)` in `src/db/db.ts` with `eventTypes`, `categories: 'id, [typeId+position]'`, `events: 'id, status, startDate, typeId'` and an `upgrade()` that creates "Général", stamps `typeId` on all categories and events, and moves the `catalog` syncState row to `catalog:<id>` with a bumped revision; verify with a new test in `src/db/db.test.ts` that opens a v1 database with 2 categories, 12 products, 3 events and a synced `catalog` row, then checks the v2 data
- [x] 1.3 Update `src/db/testing.ts` helpers to create a default type; verify `npm test` still runs

## 2. Event types and scoped catalog

- [x] 2.1 Scope `src/db/catalog.ts` by type: `listCategories(typeId)`, `addCategory(typeId, name)`, category renumbering within its type, `markCatalogDirty(typeId)` on key `catalog:<typeId>`, `replaceCatalog(typeId, …)` only replacing that type; update `src/db/catalog.test.ts` with a test proving two types' catalogs are independent; verify `npm test`
- [x] 2.2 Create `src/db/event-types.ts` (`listEventTypes`, `createEventType(name, sourceTypeId?)` with deep copy and fresh ids, `renameEventType` bumping the sync revision, `deleteEventType` refusing open events and the last type and removing categories/products/sync row, `defaultTypeId`), with case-insensitive unique-name validation; verify with `src/db/event-types.test.ts` covering every scenario of the `event-types` spec
- [x] 2.3 Make `seedIfEmpty` create the "Général" type with the example catalog when no type exists; verify with a catalog test
- [x] 2.4 Make `startEvent` require `typeId` (error when missing or unknown) in `src/db/events.ts`; verify in `src/db/events.test.ts`
- [x] 2.5 Add French strings to `src/i18n/fr.ts` (types section, "Partir de", "Configuration vide", "Type d'évènement", "Type supprimé", duplicate name, type in use, last type); verify `npm run build`

## 3. Google Sheets sync per type

- [x] 3.1 Add `GoogleApi.updateFile(id, { name?, appProperties? })` (Drive `files.update` PATCH) and support it in `src/sync/testing/fake-google.ts` and `e2e/google-mock.ts`; verify with a fake-google unit test
- [x] 3.2 Rewrite `syncCatalog(api, typeId)` in `src/sync/sync-ops.ts`: lookup by `typeId` appProperty, then by name (`pos-config-<name>`, legacy `pos-config` for "Général") raising `ConfigConflictError(typeId, fileId)`, else create; rename/stamp via `updateFile` when `syncedName` differs; verify `src/sync/sync-ops.test.ts` covers first sync of two types, rename without duplicate, deleted type untouched, migrated legacy file renamed to `pos-config-Général`
- [x] 3.3 Rewrite `importCatalog` to import all config files into matching/new types and `adoptConfigFile(typeId, fileId)`; `dirtyItems()` returns dirty type ids; verify sync-ops tests for new device import, invalid row report and partial match
- [x] 3.4 Update `src/sync/engine.ts` (`catalogTypes`, `syncCatalog(api, typeId)`, `configConflicts[]`) and `src/sync/index.ts` (`importCatalogNow`, `replaceRemoteCatalog(typeId, fileId)`); verify `src/sync/engine.test.ts` including a conflict on one type not blocking another
- [x] 3.5 Update the README `POS/pos-config` paragraph to describe `pos-config-<type>`; verify the paragraph matches the `google-sheets-sync` spec

## 4. User interface

- [x] 4.1 Settings: add the "Types d'évènement" card (list, create dialog with source select, rename, delete with confirmation / refusal message), add the required type select to the start-event form, show type names in the events list; verify with a new `e2e/event-types.spec.ts` (create from existing, rename, refuse delete of in-use type) and updated `e2e/events.spec.ts`
- [x] 4.2 Edit screen: type selector with `#/edit?type=<id>` route param and active-event default, all queries scoped to the selected type; verify `e2e/edit.spec.ts` edits a non-active type without changing the order screen, and `src/ui/router.test.ts` parses the param
- [x] 4.3 Order screen: categories from the active event's type (or the edited order's event type); verify `e2e/order.spec.ts` shows a type-only product and the type-specific price
- [x] 4.4 Home screen shows the active event's type; `usePending` counts dirty types; Export screen lists per-type conflicts and the import result per type; verify `e2e/home.spec.ts` and `e2e/sync.spec.ts`
- [x] 4.5 Update `e2e/helpers.ts` so existing e2e flows start events with a type; verify `npm run e2e` passes

## 5. Integration checks

- [x] 5.1 Run `npm run lint`, `npm test`, `npm run build` and `npm run e2e`; all pass
- [x] 5.2 Manually upgrade a browser profile holding v1 data (built from the previous commit) to the new build, check the "Général" type, events and orders, then sync and confirm `pos-config` is renamed `pos-config-Général` without a duplicate
- [x] 5.3 Run `openspec validate add-event-types --strict`; it reports the change as valid

## Workflow follow-up

- Archive the change with the `openspec-archive-change` skill after review.
