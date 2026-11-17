# google-sheets-sync Specification

## Purpose

Uses the association's own Google Drive as the free storage backend: defines the Google sign-in, the layout of the `pos-config` and `event-<date>` spreadsheets, and the offline-first synchronization between the device and Drive.

## Requirements

### Requirement: Google account connection
The user SHALL be able to connect a Google account from Settings or the Export screen. The app MUST request only the permission to access files it creates or that the user opens with it, and MUST NOT access other Drive files. The app SHALL be fully usable for taking orders without a connected account.

#### Scenario: Connect account
- **WHEN** the user taps "Connect Google account" and approves the consent screen
- **THEN** the account email is shown in Settings and synchronization becomes available

#### Scenario: Expired session
- **GIVEN** the Google authorization has expired
- **WHEN** a sync is attempted
- **THEN** orders keep being recorded locally and the user is prompted to reconnect, without data loss

### Requirement: Drive folder and files
On first sync the app SHALL create a folder "POS" in the user's Drive containing one configuration spreadsheet per event type and the event spreadsheets. If a configuration spreadsheet created by the app already exists for a type, it SHALL be reused rather than duplicated.

#### Scenario: First sync
- **GIVEN** a connected account with no app files and event types "Kermesse" and "Loto"
- **WHEN** the first sync runs
- **THEN** a "POS" folder with `pos-config-Kermesse`, `pos-config-Loto` and the active event's spreadsheet is created

### Requirement: pos-config layout
Each event type SHALL have a spreadsheet named `pos-config-<type name>` containing one sheet per category of that type, named after the category, in category order. Each sheet SHALL have a French header row and one row per product with columns: ID, Nom, Prix de vente, Prix d'achat, Couleur, Position.

#### Scenario: Catalog written
- **GIVEN** type "Kermesse" with category "Drinks" holding products "Beer" (2.50 / 1.00, #F4B400, position 1) and "Coffee" (1.50 / 0.30, #795548, position 2)
- **WHEN** sync runs
- **THEN** sheet "Drinks" of `pos-config-Kermesse` contains the header row "ID | Nom | Prix de vente | Prix d'achat | Couleur | Position" then the rows for "Beer" and "Coffee" with those values

### Requirement: Import catalog from pos-config
The user SHALL be able to load the configurations of event types from the existing `pos-config-<type name>` spreadsheets (e.g. on a new device or after editing a sheet on a computer). Import SHALL, after confirmation, replace the configuration of each matching type on the device, create the types missing on the device, and report rows it could not read.

#### Scenario: New device
- **GIVEN** `pos-config-Kermesse` and `pos-config-Loto` exist in the connected account
- **WHEN** the user imports the configurations on a new device
- **THEN** types "Kermesse" and "Loto" exist on the device with the categories and products of their spreadsheets

#### Scenario: Invalid row
- **GIVEN** a row in `pos-config-Kermesse` has a non-numeric sale price
- **WHEN** the configurations are imported
- **THEN** that row is skipped and reported to the user, other rows are imported

### Requirement: Event orders sheet
Sheet 1 "Commandes" of an event spreadsheet SHALL contain one row per order with French headers: N° commande, Heure, Statut (OK, MODIFIÉE or ANNULÉE), Modifiée à, one quantity column per product sold in the event, Total, Coût, Montant reçu. Product columns SHALL be added when a product is first sold.

#### Scenario: Order row
- **GIVEN** an order with "Beer x2" and "Chips x1" totaling 6.00
- **WHEN** it is synced
- **THEN** a row is appended with quantity 2 under "Beer", 1 under "Chips", empty or 0 for other products, and Total 6.00

#### Scenario: Voided order row
- **GIVEN** a synced order is later voided
- **WHEN** sync runs
- **THEN** that order's Statut becomes ANNULÉE and its row is not duplicated

#### Scenario: Edited order row
- **GIVEN** synced order #7 is edited from "Beer x2" to "Beer x1, Coffee x1"
- **WHEN** sync runs
- **THEN** row #7 shows the new quantities and total, Statut MODIFIÉE and the edit time in "Modifiée à", and no new row is added

### Requirement: Event summary sheet
Sheet 2 "Synthèse" SHALL list each product sold in the event with French headers Catégorie, Produit, Quantité, Chiffre d'affaires, Coût, Marge, Marge %, plus a "Total" row and the event's headline figures (nombre de commandes, panier moyen, fond de caisse, caisse attendue), excluding voided orders and using the current content of edited orders. It SHALL be fully regenerated on every sync so no manual editing is needed.

#### Scenario: Result ready at the end
- **GIVEN** the event is closed and fully synced
- **WHEN** the treasurer opens the event spreadsheet
- **THEN** the Synthèse sheet shows the complete event result with per-product margins and totals

### Requirement: Offline-first synchronization
All changes (orders, order edits, voids, catalog edits, event state) SHALL be stored on the device first and queued. When the account is connected and the device online, the app SHALL sync automatically after changes and when connectivity returns; the Export button SHALL trigger an immediate sync and report the result.

#### Scenario: Reconnect after outage
- **GIVEN** 15 orders were recorded offline
- **WHEN** the network becomes available
- **THEN** the 15 orders are written to the event spreadsheet and the pending counter returns to 0

#### Scenario: Manual export
- **WHEN** the user taps Export
- **THEN** a sync runs and the app reports success with a link to the event spreadsheet, or the error and the number of items still pending

### Requirement: Idempotent synchronization
Synchronization MUST NOT duplicate or lose orders when interrupted, retried or run after a failure, including after orders are edited; each order SHALL appear exactly once, with its latest content, in the Commandes sheet.

#### Scenario: Interrupted sync
- **GIVEN** the connection drops in the middle of a sync of 10 orders
- **WHEN** the sync is retried
- **THEN** the Commandes sheet contains each of the 10 orders exactly once

### Requirement: Device is the source of truth for events
For event data, the device SHALL be authoritative: manual edits made to the Commandes or Synthèse sheets SHALL NOT be preserved by the next sync, and the app SHALL tell the user so on the Export screen.

#### Scenario: Manual edit overwritten
- **GIVEN** the user manually edited a value in the Synthèse sheet
- **WHEN** the next sync runs
- **THEN** the Synthèse sheet is regenerated from device data

### Requirement: Configuration spreadsheet follows its type
Renaming an event type SHALL rename its configuration spreadsheet to `pos-config-<new name>` at the next sync. Deleting an event type SHALL stop its spreadsheet from being updated; the app MUST NOT delete the spreadsheet from Drive.

#### Scenario: Rename type
- **GIVEN** `pos-config-Kermesse` is synced
- **WHEN** the user renames "Kermesse" to "Fête de l'école" and sync runs
- **THEN** the same spreadsheet is now named `pos-config-Fête de l'école` and no new configuration spreadsheet is created

#### Scenario: Delete type
- **GIVEN** `pos-config-Loto` is synced
- **WHEN** the user deletes the type "Loto" and sync runs
- **THEN** `pos-config-Loto` is left untouched in Drive

### Requirement: Existing pos-config reused on upgrade
When a device upgraded from a version without event types already synced a `pos-config` spreadsheet, that spreadsheet SHALL become the configuration spreadsheet of the migrated "Général" type and be renamed `pos-config-Général` at the next sync.

#### Scenario: Upgrade with synced catalog
- **GIVEN** the device had synced its catalog to `pos-config` before the upgrade
- **WHEN** the first sync after the upgrade runs
- **THEN** the spreadsheet is renamed `pos-config-Général`, keeps its content and no duplicate is created
