# Spec Delta

## Purpose

Gives organizers a real-time view of where the event stands (revenue, orders, margin, best sellers, pace) directly on the cash register device, without needing connectivity or opening the spreadsheet.

## ADDED Requirements

### Requirement: Live stats are local and immediate
Live stats SHALL be computed on the device from the latest content of the event's recorded, non-voided orders, SHALL update immediately after an order is confirmed, edited or voided, and MUST NOT depend on network connectivity or synchronization state.

#### Scenario: Update after order
- **GIVEN** the live stats screen shows revenue 120.00 and 40 orders
- **WHEN** a 6.00 order is confirmed
- **THEN** the stats show revenue 126.00 and 41 orders without manual refresh

#### Scenario: Update after edit
- **GIVEN** live stats show 41 orders and 10 "Beer" sold
- **WHEN** an order is edited to remove one "Beer"
- **THEN** the stats show 41 orders and 9 "Beer" sold

#### Scenario: Offline stats
- **GIVEN** the device has been offline since the event started
- **WHEN** the user opens live stats
- **THEN** stats include every order recorded on the device

### Requirement: Headline figures
The live stats screen SHALL show, for the event: total revenue, number of orders, number of items sold, average order amount, total cost (sum of buy prices), and gross margin in amount and percentage of revenue.

#### Scenario: Margin computation
- **GIVEN** non-voided orders totaling revenue 200.00 with total buy cost 80.00
- **WHEN** the user opens live stats
- **THEN** cost 80.00, margin 120.00 and margin 60% are displayed

### Requirement: Per-product breakdown
The live stats screen SHALL list every product sold in the event with quantity sold, revenue, cost and margin, sortable by quantity, revenue or margin, and groupable by category with category subtotals.

#### Scenario: Best sellers
- **WHEN** the user sorts the breakdown by quantity
- **THEN** products are listed from most to least sold

#### Scenario: Category subtotals
- **WHEN** the user groups the breakdown by category
- **THEN** each category shows its subtotal of quantity, revenue and margin

### Requirement: Activity over time
The live stats screen SHALL show revenue and order count per time slot (default 30 minutes) since the start of the event, and the revenue of the last 30 minutes, so organizers can see rushes and the current pace.

#### Scenario: Rush visible
- **GIVEN** 30 orders were recorded between 20:00 and 20:30 and 5 between 20:30 and 21:00
- **WHEN** the user opens the activity chart
- **THEN** the 20:00 slot shows 30 orders and the 20:30 slot shows 5

### Requirement: Cash expected
The live stats screen SHALL show the cash amount that should be in the cash box: an optional starting float entered for the event plus the revenue of non-voided orders.

#### Scenario: Cash count check
- **GIVEN** a starting float of 50.00 and revenue of 300.00
- **WHEN** the user opens live stats
- **THEN** expected cash 350.00 is displayed

### Requirement: Stats consistent with event spreadsheet
For the same set of synced orders, the figures shown in live stats SHALL equal those written to the event spreadsheet's Synthèse sheet.

#### Scenario: End of event check
- **GIVEN** all orders are synced
- **WHEN** the user compares live stats with the Synthèse sheet
- **THEN** quantities, revenue, cost and margin per product and in total are identical
