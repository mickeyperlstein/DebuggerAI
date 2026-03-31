Feature: session-manager — session lifecycle over an injected EventBus

  A standalone npm package managing debug session lifecycles.
  The EventBus is injected at construction time (IoC).

  Note: the existing DebuggingAI src/session.ts class named SessionManager will be
  renamed to DebugStateMachine to avoid collision with this package.

  IoC chain: KafkaStore → EventBus → SessionManager

  Own repo. Own npm publish. Zero runtime dependencies beyond the injected EventBus.

  # ─── Schema ──────────────────────────────────────────────────────────────────

  Background:
    Given IEventBus exposes: publish(topic, payload), subscribe(topic, handler), unsubscribe
    And SessionManager is constructed as: new SessionManager(bus: IEventBus)
    And each session has a unique sessionId (string)
    And session lifecycle states are: created → active → ended
    And all events for a session are published to topic "session.<sessionId>"
    And an in-memory event log is maintained per session (no file persistence in v1)

  # ─── Construction ─────────────────────────────────────────────────────────────

  Scenario: SessionManager is constructed with an injected IEventBus (IoC)
    Given any conforming IEventBus instance "bus"
    When new SessionManager(bus) is called
    Then the SessionManager is ready to create and manage sessions
    And no persistence layer is opened
    And no configuration beyond the injected "bus" is required

  # ─── Session lifecycle ────────────────────────────────────────────────────────

  Scenario: Create a session transitions it to active state
    Given a SessionManager constructed with a conforming IEventBus
    When sm.createSession() is called
    Then a new sessionId is returned
    And the session state is "active"
    And a "session.created" event is published to topic "session.<sessionId>"

  Scenario: End a session transitions it to ended state
    Given an active session with id "abc"
    When sm.endSession("abc") is called
    Then the session state becomes "ended"
    And a "session.ended" event is published to topic "session.abc"

  Scenario: Events published during an active session are logged in memory
    Given an active session with id "abc"
    When sm.publish("abc", { type: "breakpoint-hit", line: 10 }) is called
    And sm.publish("abc", { type: "step" }) is called
    Then both events are appended to the in-memory log for session "abc"
    And both events are published to topic "session.abc" via the EventBus

  Scenario: Publishing to an ended session is rejected
    Given a session with id "abc" that has already ended
    When sm.publish("abc", { type: "step" }) is called
    Then an error is returned indicating the session is not active
    And no event is published to topic "session.abc"

  # ─── In-memory event log ─────────────────────────────────────────────────────

  Scenario: Event log preserves insertion order
    Given an active session with id "abc"
    And events { seq: 1 }, { seq: 2 }, { seq: 3 } are published in that order
    When sm.getLog("abc") is called
    Then the returned log contains all three events in order

  Scenario: Event log is empty for a newly created session
    Given a freshly created session with id "xyz"
    When sm.getLog("xyz") is called
    Then the returned log is empty

  # ─── Replay ──────────────────────────────────────────────────────────────────

  Scenario: Replay re-emits all logged events in order through the bus
    Given an active session with id "abc"
    And events { seq: 1 }, { seq: 2 }, { seq: 3 } are in the session log
    And subscriber "handler" is subscribed to topic "session.abc"
    When sm.replay("abc") is called
    Then "handler" receives { seq: 1 }, then { seq: 2 }, then { seq: 3 } in order
    And the original log is unchanged

  Scenario: Replay is available for ended sessions
    Given a session with id "abc" that has ended
    And its log contains { seq: 1 } and { seq: 2 }
    And subscriber "handler" is subscribed to topic "session.abc"
    When sm.replay("abc") is called
    Then "handler" receives { seq: 1 } then { seq: 2 }

  # ─── Session isolation ────────────────────────────────────────────────────────

  Scenario: Two concurrent sessions are fully isolated
    Given an active session with id "abc"
    And an active session with id "xyz"
    And subscriber "handlerAbc" is subscribed to topic "session.abc"
    And subscriber "handlerXyz" is subscribed to topic "session.xyz"
    When sm.publish("abc", { type: "step" }) is called
    Then "handlerAbc" receives { type: "step" }
    And "handlerXyz" receives nothing
    And the log for "xyz" remains empty

  Scenario: Ending one session does not affect another
    Given active sessions "abc" and "xyz"
    When sm.endSession("abc") is called
    Then session "abc" state is "ended"
    And session "xyz" state is still "active"
    And sm.publish("xyz", { type: "step" }) succeeds
