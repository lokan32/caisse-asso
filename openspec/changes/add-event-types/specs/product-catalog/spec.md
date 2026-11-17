# Spec Delta

## MODIFIED Requirements

### Requirement: Categories
Each event type's configuration SHALL organize products into named, ordered categories. The user SHALL be able to create, rename, reorder and delete categories of a type; deleting a category that still contains products MUST require confirmation and deletes those products from that type's configuration.

#### Scenario: Add a category
- **GIVEN** the active event is of type "Kermesse"
- **WHEN** the user creates a category "Food" in "Kermesse"
- **THEN** "Food" appears as a new tab on the order screen and in the editor for "Kermesse", and not in other types

#### Scenario: Delete non-empty category
- **GIVEN** category "Food" contains 4 products
- **WHEN** the user deletes "Food"
- **THEN** the app asks for confirmation before removing the category and its products

### Requirement: Edit buttons
The "Edit buttons" screen SHALL edit the configuration of one event type, showing the active event's type by default and offering a selector to switch to any other type. It SHALL show each category's grid as it appears on the order screen and let the user add, edit, delete, recolor and reposition product buttons.

#### Scenario: Reposition a button
- **WHEN** the user moves "Beer" from position 5 to position 1 in "Drinks"
- **THEN** "Beer" appears first in the "Drinks" grid on the order screen and the other products shift accordingly

#### Scenario: Edit price
- **WHEN** the user changes the sale price of "Coffee" from 1.50 to 2.00
- **THEN** new orders use 2.00 and orders already recorded keep 1.50

#### Scenario: Edit another type
- **GIVEN** the active event is of type "Loto"
- **WHEN** the user opens "Edit buttons" and selects the type "Kermesse"
- **THEN** the categories and products of "Kermesse" are shown and edited, and the order screen for "Loto" is unchanged

#### Scenario: No active event
- **GIVEN** no event is active
- **WHEN** the user opens "Edit buttons"
- **THEN** the type of the most recently started event (or the first type) is selected

### Requirement: Catalog persistence
Configuration changes SHALL be saved on the device immediately and SHALL be written to that event type's configuration spreadsheet at the next synchronization.

#### Scenario: Edit while offline
- **GIVEN** the device is offline
- **WHEN** the user adds a product to type "Kermesse"
- **THEN** the product is immediately usable on the order screen for events of type "Kermesse" and "Kermesse" is marked as pending synchronization
