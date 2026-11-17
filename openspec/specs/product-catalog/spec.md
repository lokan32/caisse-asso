# product-catalog Specification

## Purpose

Defines the catalog of products sold by the association, grouped by category, and the "Edit buttons" editor used to maintain the product grid shown when taking orders.

## Requirements

### Requirement: Product attributes
Each product SHALL have a stable identifier, a category, a name, a sale price, a buy price, a button color and a position on its category's grid. Name, sale price and category are mandatory; buy price defaults to 0.

#### Scenario: Create product with defaults
- **WHEN** the user creates a product "Coffee" in category "Drinks" with sale price 1.50 and no buy price
- **THEN** the product is saved with buy price 0, a default color, and the next free grid position in "Drinks"

#### Scenario: Reject invalid price
- **WHEN** the user enters a negative or non-numeric sale price
- **THEN** the product is not saved and the price field is flagged as invalid

### Requirement: Categories
The catalog SHALL organize products into named, ordered categories. The user SHALL be able to create, rename, reorder and delete categories; deleting a category that still contains products MUST require confirmation and deletes those products from the catalog.

#### Scenario: Add a category
- **WHEN** the user creates a category "Food"
- **THEN** "Food" appears as a new tab on the order screen and in the editor

#### Scenario: Delete non-empty category
- **GIVEN** category "Food" contains 4 products
- **WHEN** the user deletes "Food"
- **THEN** the app asks for confirmation before removing the category and its products

### Requirement: Edit buttons
The "Edit buttons" screen SHALL show each category's grid as it appears on the order screen and let the user add, edit, delete, recolor and reposition product buttons.

#### Scenario: Reposition a button
- **WHEN** the user moves "Beer" from position 5 to position 1 in "Drinks"
- **THEN** "Beer" appears first in the "Drinks" grid on the order screen and the other products shift accordingly

#### Scenario: Edit price
- **WHEN** the user changes the sale price of "Coffee" from 1.50 to 2.00
- **THEN** new orders use 2.00 and orders already recorded keep 1.50

### Requirement: Catalog persistence
Catalog changes SHALL be saved on the device immediately and SHALL be written to the `pos-config` spreadsheet at the next synchronization.

#### Scenario: Edit while offline
- **GIVEN** the device is offline
- **WHEN** the user adds a product
- **THEN** the product is immediately usable on the order screen and is marked as pending synchronization

### Requirement: Past orders are independent of catalog changes
Recorded orders SHALL keep the product name, sale price and buy price that applied at the time of the order, so that deleting or editing a product never changes past order amounts or event results.

#### Scenario: Delete product used in event
- **GIVEN** "Hot dog" was sold 10 times in the active event
- **WHEN** the user deletes "Hot dog" from the catalog
- **THEN** the 10 sales still appear in order history, live stats and the event spreadsheet
