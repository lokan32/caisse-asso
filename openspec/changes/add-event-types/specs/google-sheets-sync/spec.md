# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
