# Design

## Context

- The catalog is global: Dexie tables `categories` (`id, position`) and `products` (`id, categoryId, [categoryId+position]`) in `src/db/db.ts` (schema version 1). All functions in `src/db/catalog.ts`, plus `Edit.tsx` and `Order.tsx`, query them without any scope.
- Catalog sync state is one `syncState` row with key `catalog` (revision / syncedRevision / fileId). `syncCatalog` writes one `pos-config` spreadsheet, found through the Drive `appProperties` `posApp=config`, and raises `ConfigConflictError` when a `pos-config` exists in Drive and this device never synced one.
- The sync engine (`src/sync/engine.ts`) has `dirty(): { catalog: boolean, events }` and one `configConflict?: string`.
- Order lines already snapshot name, category name and prices, so past orders do not depend on the catalog (see `product-catalog` spec).
- OAuth scope is `drive.file`: the app can update and rename files it created.

## Goals / Non-Goals

**Goals:**
- Scope the existing catalog model to an event type with minimal changes to existing code paths.
- Safe, automatic Dexie migration of existing devices, including their already-synced `pos-config`.
- One configuration spreadsheet per type, matched robustly across devices and renames.

**Non-Goals:**
- Changing an event's type after it was started.
- Cross-type stats or comparing events of the same type.
- Showing the event type in the event spreadsheet (`event-<date>` layout unchanged).
- Deleting Drive files when a type is deleted.

## Decisions

### Data model: `typeId` on categories only
New table `eventTypes` (`id, name`; fields `id`, `name`, `createdAt`). `Category` gets `typeId`; products stay attached to their category, so they belong to a type through it. `PosEvent` gets `typeId`.
Index changes (Dexie version 2): `categories: 'id, [typeId+position]'`, `events: 'id, status, startDate, typeId'`.
*Alternative*: `typeId` on products too. Rejected: redundant, and products already move only within categories.

### Copy creates new ids
Creating a type from another clones its categories and products with fresh ids (same names, prices, colors, positions), in one transaction.
*Alternative*: keep product ids shared across types. Rejected: ids are the primary key of `products`, and the `pos-config` ID column must stay unique per spreadsheet only; shared ids would require a composite key for no user benefit.

### Catalog API takes a type id
`listCategories(typeId)`, `addCategory(typeId, name)`, `moveCategory` / `deleteCategory` renumber within the category's type; product functions are unchanged except `markCatalogDirty(typeId)`. New module `src/db/event-types.ts`: `listEventTypes`, `createEventType(name, sourceTypeId?)`, `renameEventType`, `deleteEventType` (throws if an open event uses it or if it is the last type), `defaultTypeId()` (type of the most recently started event, else the first type by name).

### Per-type sync state
`syncState` key becomes `catalog:<typeId>`, holding revision / syncedRevision / fileId plus `syncedName` (the name last written to Drive). A rename bumps the revision; sync renames the file when `syncedName` differs. Deleting a type removes its sync row, so the file is no longer touched.

### Drive matching
Config files carry `appProperties { posApp: 'config', typeId }`. Lookup order when the type has no cached `fileId`:
1. a file with `typeId=<id>` → reuse it;
2. a `posApp=config` file whose name is `pos-config-<type name>` (or the legacy `pos-config` for "Général") → `ConfigConflictError(typeId, fileId)`, the user chooses import or replace, exactly like today;
3. otherwise create `pos-config-<name>`.
Adopting or reusing a file sets its `typeId` appProperty and name with a new `GoogleApi.updateFile(id, { name?, appProperties? })` (Drive `files.update` PATCH).

### Import
`importCatalog` lists every `posApp=config` file. For each file: target type = type with matching `typeId` appProperty, else type with the matching name (legacy `pos-config` → "Général"), else a new type named after the file (`pos-config-` prefix stripped). The type's categories/products are replaced, its sync row records the fileId with `syncedRevision = revision`. Problems are reported per file. Types existing only on the device are left unchanged.

### Engine
`dirty()` returns `catalogTypes: string[]`; `syncCatalog(api, typeId)`. `configConflict` becomes `configConflicts: { typeId, fileId }[]`; a conflict blocks only its own type. Export lists conflicts by type name.

### UI
- Settings: new "Types d'évènement" card above events (list, create dialog with name + "Partir de : Configuration vide / <type>…", rename, delete with confirmation; delete hidden for the last type). Start-event form gets a required type `<select>` defaulting to `defaultTypeId()`. Events list shows the type name ("Type supprimé" if deleted).
- Edit: type `<select>` at the top; selection kept in the route (`#/edit?type=<id>`), default = active event's type, else `defaultTypeId()`.
- Order: categories filtered by the active event's type (or the edited order's event type).
- Home: active event line shows the type name.

## Risks / Trade-offs

- [Upgrade migration fails mid-way] → Dexie runs `upgrade()` in one versionchange transaction; failure rolls back to v1 data. Unit test the upgrade from a v1 database.
- [Two devices create the same type name independently] → name match in Drive raises the existing conflict flow instead of silently creating a duplicate.
- [Rename on Drive fails] → `syncedName` is only updated after success; retried at next sync.
- [Spreadsheet names with odd characters] → Drive file names accept them; only tab titles are sanitized (unchanged).
- [Deleted type referenced by closed events] → events keep `typeId`; UI falls back to "Type supprimé". Orders are unaffected since lines are snapshots.

## Migration Plan

Dexie `version(2).stores({...}).upgrade(tx => ...)`:
1. Create type `{ id: newId(), name: 'Général' }`.
2. Set `typeId` on every category and every event.
3. If a `catalog` syncState row exists, copy it to `catalog:<id>` with `revision = max(revision, syncedRevision + 1)` (forces a sync that renames the file and stamps `typeId`), and delete the old row.
4. `seedIfEmpty` creates "Général" with the example catalog on a fresh install; if types exist it does nothing.

Rollback: not supported (Dexie cannot downgrade); a previous app version would refuse to open the v2 database. Acceptable for this PWA; the Google Sheets copy remains the backup.
