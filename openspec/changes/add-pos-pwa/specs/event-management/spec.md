# Spec Delta

## Purpose

Defines events as the unit that orders, stats and result spreadsheets are attached to, and how an association starts, switches and closes an event.

## ADDED Requirements

### Requirement: Start an event
The user SHALL be able to start an event by giving a start date (default today), an optional label and an optional starting cash float. Exactly one event SHALL be active at a time; orders are always recorded against the active event.

#### Scenario: Start event today
- **GIVEN** no active event
- **WHEN** the user starts an event on 2026-11-21 labelled "Christmas market"
- **THEN** the event becomes active, the home screen shows it, and Take order is enabled

#### Scenario: Start while another is active
- **GIVEN** event "2026-11-21" is active and not closed
- **WHEN** the user starts a new event
- **THEN** the app asks for confirmation and the previous event stays open but inactive

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
