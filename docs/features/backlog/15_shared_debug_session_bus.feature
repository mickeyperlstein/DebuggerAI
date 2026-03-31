Feature: Shared debug session bus — multi-client pub/sub with replay
  As any connected client (VS Code extension, aidbg CLI, Claude, Android Studio plugin)
  I want all debug events published to a shared message bus
  So that multiple clients can observe and drive the same debug session simultaneously,
  session state can be replayed, and recordings can be synced to tutorial videos.

  # ─── BusMessage schema ─────────────────────────────────────────────────────

  Background:
    Given the DebuggingAI server is running
    And the message bus is active
    And every message on the bus conforms to:
      """
      {
        "seq":     <monotonic integer — ordering + replay index>,
        "ts":      <unix ms — wall clock, for video sync>,
        "source":  <string — client id who published>,
        "topic":   <string — e.g. "dap.stopped" | "dap.request" | "command">,
        "payload": <any — raw message body>
      }
      """

  # ─── Multi-client pub/sub ──────────────────────────────────────────────────

  Scenario: Multiple clients observe the same session simultaneously
    Given a VS Code extension client is connected to the bus as "vscode"
    And an aidbg CLI client is connected to the bus as "aidbg"
    And a Claude API client is connected to the bus as "claude"
    When the VS Code extension publishes a "dap.stopped" event at app.py:42
    Then all three clients receive the event within 100ms
    And each received message has the same "seq" value

  Scenario: Any client can send commands — all clients receive them
    Given two clients are connected: "claude" and "vscode"
    When "claude" publishes a command: { "topic": "command", "payload": { "command": "next" } }
    Then "vscode" receives the command and executes it
    And "claude" receives the resulting "dap.stopped" event published by "vscode"

  Scenario: Race condition between two simultaneous commands is accepted
    Given "claude" and "student" are both connected
    When both publish a "next" command within 10ms of each other
    Then both commands are executed in arrival order
    And both clients see both resulting stop events
    And no error is raised — last write wins is the expected behaviour

  # ─── Session logging ───────────────────────────────────────────────────────

  Scenario: Every bus message is persisted to a session log
    Given session logging is enabled
    When a debug session runs for 30 seconds with 10 stop events
    Then a file "session-<timestamp>.ndjson" exists
    And each line is a valid BusMessage JSON object
    And "seq" values are strictly monotonically increasing from 1
    And "ts" values reflect actual wall-clock timestamps

  Scenario: Session log is complete — no messages dropped
    Given 100 bus messages are published during a session
    When the session ends
    Then the ndjson log contains exactly 100 lines
    And the final "seq" value is 100

  # ─── Replay ────────────────────────────────────────────────────────────────

  Scenario: Replaying a session log re-emits messages to all subscribers
    Given a session log "session-001.ndjson" exists with 50 messages
    And a replay client is connected to the bus
    When replay is started for "session-001.ndjson"
    Then messages are emitted to all subscribers in "seq" order
    And the time between emissions matches the original "ts" deltas
    And any connected client receives the replayed events as if live

  Scenario: Replay can seek to a specific seq index
    Given a session log with 200 messages
    When replay is started at seq=100
    Then only messages with seq >= 100 are emitted
    And seq values remain from the original log (not re-numbered)

  # ─── Video sync ────────────────────────────────────────────────────────────

  Scenario: Replay is seekable by video timestamp offset
    Given a session log where T=0 corresponds to video start
    And the video player seeks to offset 00:01:23 (83000ms)
    When the replay engine receives seek(83000)
    Then it emits all messages where (ts - session_start_ts) <= 83000
    And then continues emitting subsequent messages in real time
    And the student's IDE reflects the exact debugger state the instructor had at 00:01:23

  Scenario: Student interacts during replay without breaking sync
    Given replay is running synced to a video at 00:00:45
    When the student issues their own "print a" command
    Then the command is published to the bus with a new seq and source="student"
    And replay continues from the current position uninterrupted
    And the student's action is distinguishable from the recorded session by "source"

  # ─── Teaching scenario end-to-end ──────────────────────────────────────────

  Scenario: Claude corrects a student's wrong watch expression in real time
    Given Claude is subscribed to the bus
    And the VS Code extension is publishing "dap.request" events for all onWillReceiveMessage hooks
    When the student types "a+B" in VS Code's watch panel
    Then the bus receives: { "topic": "dap.request", "payload": { "command": "evaluate", "context": "watch", "expression": "a+B" } }
    And Claude publishes: DELETE /inspect/display { expression: "a+B" }
    And Claude publishes: POST /inspect/display { expression: "a+b" }
    And the student's watch panel shows "a+b" with the correct evaluated value
