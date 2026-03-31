---
name: protocol optimization decisions
description: Bus broadcast noise reduction — OK suppression, MCP verbosity, array-first protocol, v2 coalescing
type: project
---

Bus is a broadcast channel — every message goes to all subscribers. AI agents on wildcard "*" see everything including noise.

**Why:** Local loopback means latency is fine, but signal-to-noise for AI agents is the concern. MCP protocol envelope is verbose by spec (unavoidable).

**Decisions made 2026-03-28:**
- OK suppression: `{ ok: true }` ACKs must NOT broadcast — point-to-point to caller only. Only errors and state changes broadcast.
- MCP envelope overhead: accepted cost, nothing to fix there.
- Array-first `getValues(names[])` already decided — collapses N broadcasts to 1.
- Bus-level coalescing (DataLoader pattern) is v2, non-breaking because protocol is already array-first.
- Coalescing tick window: configurable, suggested default 10ms.

**How to apply:** When adding new commands, return `{ ok: true }` point-to-point only. Only publish to bus on meaningful state changes (stopped, exited, error, breakpoint hit).

**Feature spec:** `docs/features/20_protocol_optimization.feature`
