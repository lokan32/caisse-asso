# Spec Delta

## MODIFIED Requirements

### Requirement: Settings
The settings screen SHALL let the user connect or disconnect the Google account, choose the currency symbol, enable or disable the cash-received/change step, manage event types (create, rename, delete) and manage events (start, switch, close).

#### Scenario: Change currency
- **WHEN** the user sets the currency symbol to "€"
- **THEN** all prices, totals and stats are displayed with "€"

#### Scenario: Disable change step
- **GIVEN** the change step is disabled
- **WHEN** the user validates an order
- **THEN** the order is recorded without asking for the cash received

#### Scenario: Manage event types
- **WHEN** the user opens Settings
- **THEN** a "Types d'évènement" section lists the event types and offers to create, rename and delete them

### Requirement: Home screen navigation
The home screen SHALL present five entries: Take order, Edit buttons, Order history, Settings, and Export (sync with Google account), and SHALL show the name and event type of the active event or indicate that no event is active.

#### Scenario: Navigate from home
- **WHEN** the user taps one of the five home entries
- **THEN** the corresponding screen opens and offers a way back to the home screen

#### Scenario: No active event
- **GIVEN** no event is active
- **WHEN** the user taps Take order
- **THEN** the app asks the user to start an event before taking orders

#### Scenario: Active event type shown
- **GIVEN** the active event "Kermesse 2026" is of type "Kermesse"
- **WHEN** the home screen is displayed
- **THEN** it shows "Kermesse 2026" and the type "Kermesse"
