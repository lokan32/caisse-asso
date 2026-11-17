# event-management Specification

## Purpose

Defines events as the unit that orders, stats and result spreadsheets are attached to, and how an association starts, switches and closes an event.

## Requirements

### Requirement: Start an event
The user SHALL be able to start an event by choosing an event type (default: the type of the most recently started event), a start date (default today), an optional label and an optional starting cash float. Exactly one event SHALL be active at a time; orders are always recorded against the active event.

#### Scenario: Start event today
- **GIVEN** no active event
- **WHEN** the user starts an event of type "Marché de Noël" on 2026-11-21 labelled "Christmas market"
- **THEN** the event becomes active, the home screen shows it, and Take order is enabled with the buttons of "Marché de Noël"

#### Scenario: Start while another is active
- **GIVEN** event "2026-11-21" is active and not closed
- **WHEN** the user starts a new event
- **THEN** the app asks for confirmation and the previous event stays open but inactive

#### Scenario: Type is mandatory
- **WHEN** the user tries to start an event without an event type
- **THEN** the event is not started and the type field is flagged

### Requirement: Event spreadsheet naming
Each event SHALL correspond to one spreadsheet named `event-<start date>` with the date formatted `YYYY-MM-DD`. If that name is already used by another event, a numeric suffix SHALL be added (`event-2026-11-21-2`).

#### Scenario: Two events on one day
- **GIVEN** an event spreadsheet `event-2026-11-21` already exists for another event
- **WHEN** a second event starting 2026-11-21 is synced
- **THEN** its spreadsheet is named `event-2026-11-21-2`

### Requirement: Switch active event
The user SHALL be able to reactivate a previously started event that is not closed, to resume taking orders for it (e.g. second day of a multi-day event).

#### Scenario: Resume multi-day event
- **GIVEN** event "2026-11-21" is open but inactive
- **WHEN** the user selects it as active event
- **THEN** new orders are added to it and its live stats include previous orders

### Requirement: Close an event
Closing an event SHALL make it read-only (no new orders, no editing or voiding of orders), trigger a final synchronization when online, and leave its spreadsheet with complete results. A closed event's history and stats SHALL remain viewable.

#### Scenario: Close online
- **GIVEN** an active event with all orders recorded
- **WHEN** the user closes the event while online
- **THEN** all pending orders are synced, the Synthèse sheet reflects the final totals, and the event is marked closed

#### Scenario: Close offline
- **GIVEN** the device is offline
- **WHEN** the user closes the event
- **THEN** the event is closed locally and its pending data is synced as soon as the connection returns

### Requirement: Event type of an event
Each event SHALL belong to exactly one event type, chosen when it is started and not changeable afterwards. The events list SHALL show each event's type name.

#### Scenario: Type shown in events list
- **GIVEN** event "Kermesse 2026" was started with type "Kermesse"
- **WHEN** the user opens the events list in Settings
- **THEN** the event is shown with the type "Kermesse"

#### Scenario: Resumed event keeps its type
- **GIVEN** open event "Kermesse 2026" of type "Kermesse" is inactive and event "Loto" of type "Loto" is active
- **WHEN** the user reactivates "Kermesse 2026"
- **THEN** the order screen shows the buttons of "Kermesse"
