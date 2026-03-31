---
name: npm package extraction — local-kafka, event-bus, session-manager
description: Three standalone npm packages being extracted from DebuggingAI. Architecture designed 2026-03-26.
type: project
---

Three packages extracted from DebuggingAI infrastructure:
- `local-kafka`: in-process Kafka-protocol-compatible store (IKafkaStore interface)
- `event-bus`: high-level pub/sub over IKafkaStore
- `session-manager`: session lifecycle and event replay over event-bus

**Why:** DebuggingAI needs multi-client shared session state (shared bus feature, next sprint after marketplace publish). Extracting generic infrastructure avoids coupling and makes it reusable.

**How to apply:** DebuggingAI imports only from `session-manager`. It never touches Kafka internals. Swapping LocalKafkaStore for real kafkajs = config change only.

Key seam: IKafkaStore is the only boundary between local-kafka and event-bus. event-bus must never import LocalKafkaStore directly.
