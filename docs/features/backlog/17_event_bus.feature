Feature: event-bus — typed pub/sub built on an injected IKafkaStore

  A standalone npm package providing a typed, topic-based publish/subscribe
  interface. The store is injected at construction time (IoC).

  EventBus depends only on the IKafkaStore interface. Any conforming implementation
  can be injected — in-process, remote, or otherwise. Swapping implementations is
  purely an injection-site decision; no EventBus code changes.

  IoC chain: KafkaStore → EventBus → SessionManager

  Own repo. Own npm publish. Zero runtime dependencies beyond the injected IKafkaStore.

  # ─── Schema ──────────────────────────────────────────────────────────────────

  Background:
    Given IKafkaStore exposes: produce, consume, seek, listTopics, createTopic, deleteTopic
    And EventBus is constructed as: new EventBus(store: IKafkaStore)
    And topics are plain strings (e.g. "debug.events", "session.abc123")
    And each subscriber receives an independent offset cursor into the store

  # ─── Construction ─────────────────────────────────────────────────────────────

  Scenario: EventBus is constructed with an injected IKafkaStore (IoC)
    Given any conforming IKafkaStore instance "store"
    When new EventBus(store) is called
    Then the EventBus is ready to publish and subscribe
    And no network connections are opened by EventBus itself
    And no configuration beyond the injected "store" is required

  # ─── Core pub/sub ─────────────────────────────────────────────────────────────

  Scenario: Publish a message to a topic — all current subscribers receive it
    Given an EventBus wrapping a conforming IKafkaStore
    And subscriber "handler1" is subscribed to topic "debug.events"
    When bus.publish("debug.events", { type: "breakpoint-hit", line: 42 }) is called
    Then "handler1" receives payload { type: "breakpoint-hit", line: 42 }

  Scenario: Multiple subscribers on the same topic each receive every message
    Given an EventBus wrapping a conforming IKafkaStore
    And subscriber "handlerA" is subscribed to topic "debug.events"
    And subscriber "handlerB" is subscribed to topic "debug.events"
    When bus.publish("debug.events", { type: "step" }) is called
    Then "handlerA" receives payload { type: "step" }
    And "handlerB" receives payload { type: "step" }
    And delivery to one subscriber does not affect delivery to the other

  Scenario: Subscriber on a different topic receives no cross-topic messages
    Given subscriber "handlerA" is subscribed to topic "debug.events"
    When bus.publish("session.events", { type: "started" }) is called
    Then "handlerA" receives nothing

  # ─── Offset behaviour ─────────────────────────────────────────────────────────

  Scenario: Subscriber only receives messages published after it subscribed
    Given an EventBus wrapping a conforming IKafkaStore
    And bus.publish("debug.events", { seq: 1 }) is called before any subscriber exists
    And bus.publish("debug.events", { seq: 2 }) is called before any subscriber exists
    When subscriber "lateHandler" subscribes to topic "debug.events"
    And bus.publish("debug.events", { seq: 3 }) is called
    Then "lateHandler" receives only { seq: 3 }
    And messages { seq: 1 } and { seq: 2 } are not delivered to "lateHandler"

  # ─── Unsubscribe ──────────────────────────────────────────────────────────────

  Scenario: Unsubscribe stops delivery to that subscriber
    Given an EventBus wrapping a conforming IKafkaStore
    And subscriber "handler" is subscribed to topic "debug.events"
    And bus.publish("debug.events", { msg: "first" }) is called
    And "handler" receives { msg: "first" }
    When handler.unsubscribe() is called
    And bus.publish("debug.events", { msg: "second" }) is called
    Then "handler" does not receive { msg: "second" }

  Scenario: Unsubscribing one subscriber does not affect others
    Given subscriber "handlerA" and "handlerB" are both subscribed to "debug.events"
    When "handlerA" calls unsubscribe()
    And bus.publish("debug.events", { msg: "after" }) is called
    Then "handlerB" receives { msg: "after" }
    And "handlerA" receives nothing

  # ─── Swap store ───────────────────────────────────────────────────────────────

  Scenario: Any conforming IKafkaStore implementation can be injected with no code changes
    Given subscriber "handler" is subscribed to topic "debug.events"
    When the EventBus is constructed with a different IKafkaStore implementation
    And bus.publish("debug.events", { type: "step" }) is called
    Then "handler" receives { type: "step" }
    And no EventBus code changed — only the IKafkaStore instance passed to the constructor
    And no subscriber code changed
