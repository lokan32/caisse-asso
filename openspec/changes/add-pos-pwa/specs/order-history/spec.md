# Spec Delta

## Purpose

Lets the cashier review the orders recorded for an event and correct mistakes by editing or voiding an order, while keeping a traceable record.

## ADDED Requirements

### Requirement: List event orders
The order history screen SHALL list the orders of the active event (or of a selected event), most recent first, each showing its sequence number, time, total amount, number of items, sync status and whether it is voided or modified.

#### Scenario: View history
- **GIVEN** the active event has 12 orders
- **WHEN** the user opens Order history
- **THEN** 12 orders are listed newest first with time, total and sync status

### Requirement: Order details
Selecting an order SHALL show its lines (product, quantity, unit price, line amount), total, amount received, change and, if modified, the time of the last edit.

#### Scenario: Open an order
- **WHEN** the user taps order #7
- **THEN** its product lines, total, amount received and change are displayed

### Requirement: Void an order
The user SHALL be able to void an order of an open event after confirmation. A voided order SHALL remain listed and marked as voided, SHALL be excluded from live stats and from event result totals, and the void SHALL be propagated to the event spreadsheet.

#### Scenario: Void a mistaken order
- **GIVEN** order #7 of 6.00 in the active event
- **WHEN** the user voids order #7 and confirms
- **THEN** order #7 is shown as voided, live stats revenue decreases by 6.00, and after sync the order row in the event spreadsheet is marked voided and excluded from the summary

#### Scenario: Closed event
- **GIVEN** the event is closed
- **WHEN** the user opens an order of that event
- **THEN** no void action is offered


### Requirement: Edit an order
The user SHALL be able to edit an order of an open event to fix a mistake: add, remove or change product quantities. The edited order SHALL keep its order number and original time, record the time of the last edit, and keep the unit prices captured when it was sold (products added during the edit use current catalog prices).

#### Scenario: Fix a wrong product
- **GIVEN** order #7 contains "Beer x2" (2.50 each) totaling 5.00
- **WHEN** the user edits order #7, removes one "Beer", adds one "Coffee" (1.50) and saves
- **THEN** order #7 contains "Beer x1" and "Coffee x1", totals 4.00, keeps number #7 and its original time, and shows a "modified" badge in the history

#### Scenario: Edit keeps original prices
- **GIVEN** order #7 sold "Coffee" at 1.50 and the catalog price is now 2.00
- **WHEN** the user edits order #7 and only changes another line
- **THEN** the "Coffee" line of order #7 stays at 1.50

#### Scenario: Edit to an empty order
- **WHEN** the user removes every product while editing an order
- **THEN** the app refuses to save and offers to void the order instead

#### Scenario: Closed or voided order
- **GIVEN** the order belongs to a closed event or is voided
- **WHEN** the user opens the order
- **THEN** no edit action is offered

### Requirement: Cash adjustment on edit
When the change step is enabled and an edited order's total differs from its previous total, the app SHALL display the difference to collect from or give back to the customer before saving.

#### Scenario: Customer owes more
- **GIVEN** order #7 totaled 4.00 and was paid with 5.00
- **WHEN** the user edits it to a total of 6.50
- **THEN** the app shows 1.50 to collect and records 6.50 as amount received when saved

#### Scenario: Refund difference
- **GIVEN** order #7 totaled 6.00
- **WHEN** the user edits it to a total of 4.00
- **THEN** the app shows 2.00 to give back to the customer

### Requirement: Edits propagate to stats and spreadsheet
Saving an edited order SHALL immediately update live stats and SHALL mark the event for synchronization so the order's existing row in the event spreadsheet is updated in place and marked as modified, never duplicated.

#### Scenario: Stats after edit
- **GIVEN** live stats show revenue 100.00 including order #7 at 5.00
- **WHEN** order #7 is edited to 4.00
- **THEN** live stats show revenue 99.00 and the product quantities reflect the edit
