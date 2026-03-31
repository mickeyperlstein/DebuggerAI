Feature: server-discovery — upsert pattern for shared central server

  DebuggingAI clients (VS Code extension, CLI, MCP) discover or spawn a single
  shared server process on a fixed local port. The interaction is an "upsert":

    - Found:   server already running → connect and register as a new session
    - Created: nothing running → spawn server, wait for ready, then connect and register

  The server owns its own lifetime. When the last client disconnects it starts a
  countdown and destroys itself if no new client arrives before the timer fires.
  MCP callers are unaware of this mechanism — discovery is internal to the client.

  # ─── Config ──────────────────────────────────────────────────────────────────

  Background:
    Given the default server port is 7890
    And the environment variable DEBUGAI_PORT overrides the default port
    And the environment variable DEBUGAI_IDLE_TIMEOUT_MS controls the harakiri countdown
    And DEBUGAI_IDLE_TIMEOUT_MS defaults to 30000
    And setting DEBUGAI_IDLE_TIMEOUT_MS to 0 disables self-termination entirely

  # ─── Upsert: created ─────────────────────────────────────────────────────────

  Scenario: First client spawns the server when nothing is running
    Given no process is listening on port 7890
    When a VS Code extension client attempts to connect to port 7890
    Then the client receives "connection refused"
    And the client spawns the server as a detached child process
    And the client polls port 7890 until the server signals ready
    When the server is ready
    Then the client connects and registers its session
    And the server returns a unique sessionId to the client

  Scenario: Spawned server process is detached from the client lifecycle
    Given the client has spawned the server
    When the client process exits
    Then the server continues running
    And the server port remains open for subsequent clients

  # ─── Upsert: found ───────────────────────────────────────────────────────────

  Scenario: Subsequent client registers without spawning
    Given a server is already listening on port 7890
    When a second client attempts to connect to port 7890
    Then the connection succeeds immediately
    And the client registers its session
    And the server returns a unique sessionId to the second client
    And no additional server process is spawned

  Scenario: Registration is idempotent on reconnect
    Given a client holds sessionId "sess-abc"
    When the client disconnects and reconnects to the same running server
    And the client sends its previous sessionId "sess-abc" during registration
    Then the server upserts the session and returns sessionId "sess-abc"
    And no duplicate session entry is created

  # ─── Fixed port, transparent to MCP ─────────────────────────────────────────

  Scenario: MCP callers are unaware of server discovery
    Given an MCP client is configured with endpoint "localhost:7890"
    When the MCP client issues any tool call
    Then the VS Code extension has already ensured the server is running on port 7890
    And the MCP call succeeds without the MCP layer performing any discovery logic

  Scenario: Port is fixed and not negotiated at runtime
    Given two clients start concurrently
    When both attempt to connect to port 7890 simultaneously
    Then exactly one client spawns the server
    And the other client waits and then connects to the already-running server
    And both clients receive distinct sessionIds

  # ─── Harakiri shutdown ───────────────────────────────────────────────────────

  Scenario: Server starts idle countdown when the last client disconnects
    Given a server is running with one registered client
    When that client disconnects
    Then the server starts a countdown of DEBUGAI_IDLE_TIMEOUT_MS milliseconds
    And the server remains on port 7890 during the countdown

  Scenario: New client arrival cancels the idle countdown
    Given the server is counting down to self-termination
    When a new client connects and registers before the timer fires
    Then the countdown is cancelled
    And the server remains alive

  Scenario: Server self-terminates after idle timeout with no clients
    Given the server is counting down to self-termination
    And no client connects before the timer fires
    When the idle timer fires
    Then the server flushes all in-flight messages
    And the server closes the port
    And the server process exits cleanly

  Scenario: DEBUGAI_IDLE_TIMEOUT_MS=0 disables self-termination
    Given DEBUGAI_IDLE_TIMEOUT_MS is set to 0
    When the last client disconnects
    Then the server does not start any countdown
    And the server remains running indefinitely until explicitly stopped

  # ─── Crash recovery ──────────────────────────────────────────────────────────

  Scenario: Client triggers a fresh spawn after server crash
    Given a server was running on port 7890 but has crashed unexpectedly
    When a client attempts to connect to port 7890
    Then the client receives "connection refused"
    And the client treats this the same as "upsert: created"
    And the client spawns a fresh server process
    And the client connects and registers a new session

  Scenario: Sessions from a crashed server are not recovered
    Given a server crashed while sessions "sess-1" and "sess-2" were active
    When the fresh server starts
    Then "sess-1" and "sess-2" do not exist on the new server
    And clients must re-register to obtain new sessionIds
    And this data loss is accepted in v1 because sessions are in-memory only

  # ─── Multi-session isolation ─────────────────────────────────────────────────

  Scenario: Two VS Code windows share the server but have isolated sessions
    Given VS Code window A has registered sessionId "sess-A"
    And VS Code window B has registered sessionId "sess-B"
    When window A publishes an event to topic "debugger/paused" on session "sess-A"
    Then the event appears in session "sess-A"'s topic stream
    And the event does not appear in session "sess-B"'s topic stream

  Scenario: Session teardown does not affect sibling sessions
    Given VS Code window A (session "sess-A") and window B (session "sess-B") are both connected
    When window A disconnects and session "sess-A" is torn down
    Then session "sess-B" remains active and continues to receive events
    And the server does not start the idle countdown because "sess-B" is still registered
