# app-shell Specification

## Purpose

Provides the installable, offline-capable application frame: the home screen with its navigation entries and the settings screen used by an association to configure the cash register.

## Requirements

### Requirement: Installable offline application
The application SHALL be installable on a phone, tablet or computer from a web browser and SHALL open and remain fully usable for taking orders without network connectivity once it has been loaded at least once.

#### Scenario: App opens offline
- **GIVEN** the app was opened once while online and the catalog was loaded
- **WHEN** the user opens the app with no network connection
- **THEN** the home screen is displayed and the user can take orders

#### Scenario: Install prompt
- **WHEN** the user opens the app in a browser that supports installation
- **THEN** the app can be added to the home screen and launches full screen without browser chrome

### Requirement: French user interface
All user-facing text SHALL be in French (labels, buttons, messages, errors, confirmations). Amounts SHALL be displayed in French format with a comma decimal separator (e.g. "1,50 €"), dates as DD/MM/YYYY and times in 24-hour format. Amount inputs SHALL accept both "," and "." as decimal separator.

#### Scenario: Home in French
- **WHEN** the home screen is displayed
- **THEN** the entries read "Prendre une commande", "Modifier les boutons", "Historique des commandes", "Paramètres" and "Exporter"

#### Scenario: French amount format
- **GIVEN** a current order totaling 6.5
- **WHEN** the total is displayed
- **THEN** it reads "6,50 €"

#### Scenario: Decimal input
- **WHEN** the user types "1.50" or "1,50" as a price or amount received
- **THEN** both are understood as one euro fifty

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

### Requirement: Live stats summary on home screen
The home screen SHALL display a compact summary of the active event's live stats (revenue and number of orders) that opens the full live stats screen when tapped.

#### Scenario: Summary visible
- **GIVEN** an active event with recorded orders
- **WHEN** the home screen is displayed
- **THEN** the current revenue and order count of the event are shown

### Requirement: Sync status indicator
The application SHALL display whether the Google account is connected and how many orders are pending synchronization.

#### Scenario: Pending orders shown
- **GIVEN** 3 orders were recorded while offline
- **WHEN** the user looks at the home screen
- **THEN** an indicator shows 3 pending orders not yet synced

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
