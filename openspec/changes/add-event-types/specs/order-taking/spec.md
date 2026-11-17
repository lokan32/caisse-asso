# Spec Delta

## MODIFIED Requirements

### Requirement: Product grid
The order screen SHALL display the configuration of the active event's type: one tab per category of that type and, for the selected category, a grid of large tappable buttons showing each product's name and sale price in the product's color, ordered by grid position. When editing an order, the configuration of that order's event type SHALL be shown.

#### Scenario: Switch category
- **WHEN** the user taps the "Food" tab
- **THEN** the grid shows the products of "Food" in their configured positions and colors

#### Scenario: Products depend on the event type
- **GIVEN** "Barbe à papa" exists only in type "Kermesse" and the active event is of type "Marché de Noël"
- **WHEN** the user opens the order screen
- **THEN** "Barbe à papa" is not shown

#### Scenario: Price depends on the event type
- **GIVEN** "Café" costs 1,50 € in "Kermesse" and 2,00 € in "Marché de Noël"
- **WHEN** the user adds "Café" to an order of an event of type "Marché de Noël"
- **THEN** the line is priced 2,00 €
