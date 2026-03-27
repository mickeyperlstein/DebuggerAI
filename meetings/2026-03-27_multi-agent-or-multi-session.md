# Meeting: Multi Agent or Multi Session — Debugger Architecture Decision
Date: 2026-03-27

## Participants
- MOD + ARCH: Claude — playing Senior Staff Engineer (Architect) + facilitator — `.claude/agents/architect.md`
- PM: PM Agent — Cutthroat product manager for DebuggingAI and Perli — `~/.claude/agents/pm.md`

## Goal
Decide the right architecture: single server with multi-session (kafka-esque topics) vs. multi-port servers — to support one VS Code instance debugging with multiple debuggers simultaneously, and agents viewing multiple sessions.

## Relevant Info
- DebuggingAI: VS Code extension nearly marketplace-ready, 61/61 tests passing, Sprints 1-4 complete
- Next sprint: shared pub/sub bus (features/15_shared_debug_session_bus.feature)
- BusMessage schema: { seq, ts, source, topic, payload }
- 4 new feature specs drafted: local_kafka (16), event_bus (17), session_manager (18), server_discovery (19) — unreviewed

## Agenda
1. Restate constraint: same VS Code instance must support multiple simultaneous debuggers
2. Compare Option A — single server, multi-session via kafka-esque topics
3. Compare Option B — multi-port servers (one per session/debugger)
4. Agent access: how agents subscribe to/view multiple sessions in each model
5. Decision + recommended direction

## Notes
- Use cases: microservices chain debugging, client-server, distributed log tracing (ELK)
- Microservices chain is highest-value target — distributed tracing tools don't give IDE-level step-through
- Array-first protocol: all value requests/responses are arrays even for single values — locks in zero-breaking-change upgrade path
- Bus-level aggregation (DataLoader/coalescing) deferred to v2 — protocol is already non-breaking
- Option A (single server, sessionId routing) chosen over Option B (multi-port) — multi-port = ops/security nightmare
- Wildcard subscription (`sessionId: "*"`) — ~20-30 lines, build now, high leverage
- Sessions created implicitly on first publish, no registration step
- LocalKafka = internal SRP class, NOT a standalone npm package
- IKafkaStore interface locked before implementation — prevents scope creep into offset/consumer-group semantics

## Rolling Summary
- Agreed on microservices chain as primary use case
- Array-first protocol locked in — v1 passes through, v2 coalesces at bus level
- Option A chosen: single server, sessionId-namespaced topics, wildcard subscriptions
- LocalKafka as internal SRP class implementing IKafkaStore — v1 scope: sessionId routing + wildcard only

## Decisions
1. **Architecture: Option A** — single server, one port, sessionId-namespaced routing
2. **BusMessage schema updated**: `{ seq, ts, source, topic, sessionId, payload }`
3. **Wildcard subscriptions**: agents subscribe to `sessionId: "*"` or specific id — build this sprint
4. **Session creation**: implicit on first publish, no explicit registration
5. **Array-first protocol**: all value requests/responses are arrays — v1 passthrough, v2 bus coalescing, zero breaking changes
6. **LocalKafka**: internal SRP class implementing `IKafkaStore` — lives in repo, not published; v1 scope is sessionId routing + wildcard; full Kafka semantics (offsets, seek, consumer groups) deferred to v2
7. **Interface contract locked before implementation begins**
8. **Open question**: tick window for v2 coalescing (suggested 5-20ms configurable default)
