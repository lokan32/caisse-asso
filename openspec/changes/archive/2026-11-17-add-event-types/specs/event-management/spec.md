# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
