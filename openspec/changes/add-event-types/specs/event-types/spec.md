# Spec Delta

## Purpose

Defines event types (e.g. Kermesse, Christmas market) as named, reusable button configurations, so that each kind of event keeps its own products and prices and new configurations can be derived from existing ones.

## ADDED Requirements

### Requirement: Event type attributes
Each event type SHALL have a stable identifier, a unique non-empty name (case-insensitive) and its own button configuration (categories and products). The configuration of one type SHALL be independent of every other type's configuration.

#### Scenario: Independent configurations
- **GIVEN** types "Kermesse" and "Marché de Noël" both contain a product "Café" at 1,50 €
- **WHEN** the user changes the price of "Café" to 2,00 € in "Kermesse"
- **THEN** "Café" still costs 1,50 € in "Marché de Noël"

#### Scenario: Duplicate name rejected
- **GIVEN** a type "Kermesse" exists
- **WHEN** the user creates a type named "kermesse"
- **THEN** the type is not created and the name field is flagged as already used

### Requirement: Create an event type
The user SHALL be able to create an event type by giving a name and choosing its initial configuration: either empty, or a copy of the configuration of an existing type.

#### Scenario: Create empty type
- **WHEN** the user creates the type "Loto" with an empty configuration
- **THEN** "Loto" exists with no categories and no products

#### Scenario: Create from existing configuration
- **GIVEN** type "Kermesse" has categories "Boissons" and "Snacks" with 8 products
- **WHEN** the user creates the type "Kermesse 2027" from the configuration of "Kermesse"
- **THEN** "Kermesse 2027" has the same categories in the same order and the same products with the same names, prices, buy prices, colors and positions

### Requirement: Copied configuration is independent
A configuration copied from another type SHALL be a separate copy: later changes to either type MUST NOT affect the other.

#### Scenario: Edit the copy
- **GIVEN** "Kermesse 2027" was created from "Kermesse"
- **WHEN** the user deletes the product "Barbe à papa" from "Kermesse 2027"
- **THEN** "Barbe à papa" is still present in "Kermesse"

### Requirement: Rename an event type
The user SHALL be able to rename an event type; the new name MUST be non-empty and unique. Events of that type SHALL show the new type name.

#### Scenario: Rename
- **WHEN** the user renames "Kermesse" to "Kermesse de l'école"
- **THEN** the type list, the start-event form and the events of that type show "Kermesse de l'école"

### Requirement: Delete an event type
The user SHALL be able to delete an event type, after confirmation, only when no open event uses it. Deleting a type SHALL delete its configuration; closed events of that type and their orders SHALL remain viewable.

#### Scenario: Type used by an open event
- **GIVEN** event "Kermesse 2026" of type "Kermesse" is open
- **WHEN** the user tries to delete "Kermesse"
- **THEN** the deletion is refused and the app explains that an open event uses this type

#### Scenario: Type used only by closed events
- **GIVEN** all events of type "Loto" are closed
- **WHEN** the user deletes "Loto" and confirms
- **THEN** "Loto" and its configuration are removed and the closed events' history and stats remain viewable

### Requirement: At least one event type
The app SHALL always provide at least one event type. On first launch, a type named "Général" SHALL be created with the example configuration. The last remaining type MUST NOT be deletable.

#### Scenario: Last type
- **GIVEN** only the type "Général" exists
- **WHEN** the user opens its actions
- **THEN** deleting it is not offered

### Requirement: Migration of the existing catalog
When the app is upgraded from a version without event types, the existing catalog SHALL become an event type named "Général", every existing event SHALL be attached to it, and no category, product, event or order SHALL be lost.

#### Scenario: Upgrade with existing data
- **GIVEN** a device with 2 categories, 12 products and 3 events created before this change
- **WHEN** the upgraded app opens
- **THEN** a type "Général" holds the 2 categories and 12 products, and the 3 events are of type "Général" with all their orders
