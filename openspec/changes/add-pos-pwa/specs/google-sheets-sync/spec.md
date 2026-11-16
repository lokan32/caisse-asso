# Spec Delta

## Purpose

Uses the association's own Google Drive as the free storage backend: defines the Google sign-in, the layout of the `pos-config` and `event-<date>` spreadsheets, and the offline-first synchronization between the device and Drive.

## ADDED Requirements

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
On first sync the app SHALL create a folder "POS" in the user's Drive containing the `pos-config` spreadsheet and the event spreadsheets. If a `pos-config` created by the app already exists, it SHALL be reused rather than duplicated.

#### Scenario: First sync
- **GIVEN** a connected account with no app files
- **WHEN** the first sync runs
- **THEN** a "POS" folder with `pos-config` and the active event's spreadsheet is created

### Requirement: pos-config layout
`pos-config` SHALL contain one sheet per category, named after the category, in category order. Each sheet SHALL have a French header row and one row per product with columns: ID, Nom, Prix de vente, Prix d'achat, Couleur, Position.

#### Scenario: Catalog written
- **GIVEN** category "Drinks" with products "Beer" (2.50 / 1.00, #F4B400, position 1) and "Coffee" (1.50 / 0.30, #795548, position 2)
- **WHEN** sync runs
- **THEN** sheet "Drinks" contains the header row "ID | Nom | Prix de vente | Prix d'achat | Couleur | Position" then the rows for "Beer" and "Coffee" with those values

### Requirement: Import catalog from pos-config
The user SHALL be able to load the catalog from an existing `pos-config` spreadsheet (e.g. on a new device or after editing the sheet on a computer). Import SHALL replace the device catalog after confirmation and SHALL report rows it could not read.

#### Scenario: New device
- **GIVEN** a `pos-config` exists in the connected account
- **WHEN** the user imports the catalog on a new device
- **THEN** categories and products from the spreadsheet appear on the order screen

#### Scenario: Invalid row
- **GIVEN** a row in `pos-config` has a non-numeric sale price
- **WHEN** the catalog is imported
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
