Feature: local-kafka — Kafka-protocol-compatible in-process store

  A standalone npm package that implements the Kafka producer/consumer protocol
  locally with no broker, no Zookeeper, no infrastructure.

  Think: SQLite is to Postgres as local-kafka is to Kafka.
  Swapping to a real Kafka cluster (via kafkajs) requires only a config change.

  Own repo. Own npm publish. Zero runtime dependencies.

  # ─── Schema ─────────────────────────────────────────────────────────────────

  Background:
    Given ProducerRecord: { topic, partition=0, key, value, headers, timestamp }
    And ConsumerRecord:   { topic, partition, offset, key, value, headers, timestamp }
    And offsets are strings (Kafka-compatible)

  # ─── IKafkaStore interface ───────────────────────────────────────────────────

  Scenario: IKafkaStore mirrors the kafkajs Producer/Consumer API
    Given an implementation provides:
      | produce     | Producer.send()          |
      | consume     | Consumer.run()           |
      | seek        | Consumer.seek()          |
      | listTopics  | Admin.listTopics()       |
      | createTopic | Admin.createTopics()     |
      | deleteTopic | Admin.deleteTopics()     |
    Then local-kafka and kafkajs are drop-in replacements for each other

  # ─── Core behaviour ──────────────────────────────────────────────────────────

  Scenario: Produce assigns next offset and returns RecordMetadata
    When a ProducerRecord is sent to topic "events"
    Then it is stored at the next offset
    And RecordMetadata { topic, partition, offset } is returned

  Scenario: Consumer groups track offsets independently
    Given group "a" is at offset "3" and group "b" is at offset "7"
    When both consume topic "events"
    Then each receives records from their own offset forward
    And committing one does not affect the other

  Scenario: Consumer resumes from last committed offset after restart
    Given group "a" committed offset "7" before stopping
    When "a" restarts and begins consuming
    Then it receives records starting at offset "8"

  Scenario: Seek to specific offset
    Given group "a" is at offset "50"
    When seek("events", partition=0, offset="20") is called
    Then the next consume returns records from offset "20"

  # ─── Upgrade path ────────────────────────────────────────────────────────────

  Scenario: Swap local-kafka for real Kafka with no code changes
    Given the consumer of IKafkaStore is initialized with KafkaJsAdapter({ brokers })
    Then all produce/consume/seek calls are forwarded to the real cluster
    And no calling code changes
