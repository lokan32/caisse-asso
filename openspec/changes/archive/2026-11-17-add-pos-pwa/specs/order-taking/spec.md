# Spec Delta

## Purpose

Covers the cashier's main workflow: composing an order by tapping product buttons, seeing the running total, computing change for cash payments, and recording the order against the active event.

## ADDED Requirements

### Requirement: Product grid
The order screen SHALL display one tab per category and, for the selected category, a grid of large tappable buttons showing each product's name and sale price in the product's color, ordered by grid position.

#### Scenario: Switch category
- **WHEN** the user taps the "Food" tab
- **THEN** the grid shows the products of "Food" in their configured positions and colors

### Requirement: Add products to the current order
Tapping a product button SHALL add one unit of that product to the current order. The current order SHALL show each product line with quantity and line amount, and the order total, updated immediately.

#### Scenario: Tap twice
- **GIVEN** an empty current order
- **WHEN** the user taps "Beer" (2.50) twice and "Chips" (1.00) once
- **THEN** the current order shows "Beer x2 = 5.00", "Chips x1 = 1.00" and total 6.00

#### Scenario: Quantity badge on button
- **GIVEN** "Beer" is in the current order with quantity 2
- **WHEN** the grid is displayed
- **THEN** the "Beer" button shows a badge with quantity 2

### Requirement: Adjust the current order
The user SHALL be able to decrease or remove a line of the current order and to clear the entire current order before validation.

#### Scenario: Remove one unit
- **GIVEN** "Beer x2" in the current order
- **WHEN** the user decreases "Beer" by one
- **THEN** the line becomes "Beer x1" and the total is updated

#### Scenario: Clear order
- **WHEN** the user clears the current order
- **THEN** the current order is empty and nothing is recorded

### Requirement: Cash received and change
When the change step is enabled, validating an order SHALL ask for the amount received, offering quick-amount buttons (exact amount and common banknotes/coins), and SHALL display the change to give back. Validation MUST be refused while the amount received is lower than the total.

#### Scenario: Compute change
- **GIVEN** a current order totaling 6.00
- **WHEN** the user selects 10 as amount received
- **THEN** the app displays change 4.00 and allows confirming the order

#### Scenario: Insufficient amount
- **GIVEN** a current order totaling 6.00
- **WHEN** the user enters 5.00 as amount received
- **THEN** the order cannot be confirmed and the missing 1.00 is shown

### Requirement: Record the order
Confirming SHALL record the order on the device with a unique identifier, the event, a timestamp, each line (product identifier, name, quantity, unit sale price, unit buy price), the total amount and the amount received if any; then the current order SHALL be emptied for the next customer. Recording MUST NOT require network connectivity.

#### Scenario: Confirm offline
- **GIVEN** the device is offline
- **WHEN** the user confirms an order
- **THEN** the order is saved, appears in order history and live stats, is marked pending synchronization, and the order screen is ready for the next order

#### Scenario: Empty order
- **WHEN** the user tries to validate an empty order
- **THEN** nothing is recorded

### Requirement: Fast operation
Adding a product and confirming an order SHALL each give visible feedback in under 200 ms on a mid-range phone, independent of network state.

#### Scenario: Busy rush
- **WHEN** the user records 20 consecutive orders on a slow or absent network
- **THEN** no step waits on the network
