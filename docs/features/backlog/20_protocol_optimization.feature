Feature: protocol optimization — reduce bus broadcast noise

  The DebuggingAI bus is a broadcast channel. Every message goes to every
  subscriber. As AI agents subscribe to "*" (wildcard), they receive all
  traffic including ACK/OK responses that carry no useful information for
  observers.

  Two problems identified (2026-03-28, local bus — deferred to v2):
    1. OK suppression  — { ok: true } ACKs broadcast to all subscribers,
                         polluting AI agent event streams with noise.
    2. MCP envelope    — MCP JSON-RPC wrapper is verbose by spec; unavoidable
                         for MCP-compatible clients but adds overhead.

  Local loopback makes latency negligible. The issue is signal-to-noise
  for AI agents watching the bus.

  # ─── OK suppression ─────────────────────────────────────────────────────────

  Scenario: Command ACKs are NOT broadcast to the bus
    Given a debug command is issued (e.g. next, print, set_breakpoint)
    When the command succeeds
    Then { ok: true } is returned point-to-point to the caller only
    And the bus does NOT broadcast the ok response to other subscribers
    And only meaningful state changes (stopped, exited, error) are broadcast

  Scenario: Errors ARE broadcast to the bus
    Given a debug command fails
    Then { ok: false, error: "..." } is broadcast to the bus
    And all subscribers receive the error event with the originating sessionId

  # ─── BusMessage stays lean ───────────────────────────────────────────────────

  Scenario: BusMessage schema carries no redundant fields
    Given a BusMessage: { seq, ts, source, topic, sessionId, payload }
    Then no ok/ack fields appear at the envelope level
    And payload carries only domain-relevant data
    And the MCP layer handles its own JSON-RPC envelope separately

  # ─── Array-first protocol (already decided, referenced here) ─────────────────

  Scenario: getValues collapses N requests into 1 broadcast
    Given an AI agent needs values for ["x", "y", "z"]
    When it calls getValues(["x", "y", "z"])
    Then ONE bus message is broadcast (not three)
    And the response is { name, value }[] — always an array

  # ─── v2: bus-level coalescing ────────────────────────────────────────────────

  Scenario: Bus coalesces duplicate getValues requests within a tick window
    Given agent A requests ["x", "y"] and agent B requests ["z", "x"]
    When both arrive within the coalescing window (default: 10ms, configurable)
    Then the bus deduplicates: issues ONE getValues(["x", "y", "z"]) to the debugger
    And fans results back to each agent
    And agents remain stateless — coalescing is invisible to them
    And the tick window is configurable (suggested default: 10ms)

  # ─── Out of scope ─────────────────────────────────────────────────────────────

  # - Binary protocol: not planned, JSON is sufficient for local loopback
  # - Direct-addressing on the bus: deferred, broadcast works for current scale
  # - MCP protocol changes: not possible, MCP spec is external
