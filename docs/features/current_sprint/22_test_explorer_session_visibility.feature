Feature: Test Explorer session visibility — attach to programmatically-started debug sessions
  As an AI agent or developer using the VS Code Test Explorer
  I want DebuggingAI to detect and join debug sessions started by test runner extensions
  So that sessions launched via the Test Explorer debug button (e.g. Patrol) are visible
  alongside sessions started from launch.json named configurations

  Background:
    Given the DebuggingAI VS Code extension is installed and active
    And a workspace is open

  # ─── Core: universal session discovery ──────────────────────────────────────

  Scenario: DebuggingAI detects a programmatically-started debug session
    Given no .vscode/launch.json entry exists for the session
    When a test runner extension starts a debug session via vscode.debug.startDebugging()
    Then DebuggingAI receives the onDidStartDebugSession event
    And it registers the session as attachable
    And the session appears in the DebuggingAI session picker

  Scenario: DebuggingAI detects a launch.json session (existing behaviour unchanged)
    When a user starts a debug session from the Run & Debug panel using a named config
    Then DebuggingAI registers it as before
    And both programmatic and named sessions appear in the session picker together

  # ─── Patrol / Flutter Test Explorer ─────────────────────────────────────────

  Scenario: Identify a Patrol test session by PATROL_TEST_SERVER_PORT
    Given the Patrol extension starts a Flutter integration test via the Test Explorer
    When DebuggingAI inspects the new session's configuration
    And session.configuration contains "PATROL_TEST_SERVER_PORT" in dartDefines or args
    Then DebuggingAI labels the session as "Patrol test" in the session picker
    And it registers the session for AI attachment

  Scenario: Identify a generic Dart/Flutter session by type
    When a new debug session fires with session.type === "dart"
    And no PATROL_TEST_SERVER_PORT marker is present
    Then DebuggingAI registers it as a generic Flutter session
    And exposes it in the session picker with name derived from session.name

  # ─── Session metadata ────────────────────────────────────────────────────────

  Scenario: Session picker shows session id, name, and type for programmatic sessions
    Given a programmatic debug session has started
    When the user opens the DebuggingAI session picker
    Then each entry displays:
      | field | source                          |
      | id    | session.id                      |
      | name  | session.name (auto-generated)   |
      | type  | session.type (e.g. "dart")      |
      | origin| "testExplorer" or "launchJson"  |

  # ─── AI agent flow ───────────────────────────────────────────────────────────

  Scenario: AI agent discovers and attaches to a Test Explorer session
    Given the Patrol Test Explorer started a debug session
    When the AI agent calls session_status or list_sessions
    Then the programmatic session is included in the response
    And the AI can attach to it using the existing attach / join flow
    And the AI can set breakpoints, inspect variables, and step through test code

  # ─── Edge cases ──────────────────────────────────────────────────────────────

  Scenario: Session ends before AI attaches
    Given a programmatic session was registered
    When the session terminates before the AI attaches
    Then DebuggingAI removes it from the session picker gracefully
    And no error is thrown

  Scenario: Multiple concurrent Test Explorer sessions
    Given two Patrol tests are running concurrently
    When both debug sessions fire onDidStartDebugSession
    Then DebuggingAI registers both separately
    And the AI can attach to either independently

  # ─── Implementation note ─────────────────────────────────────────────────────

  # Use vscode.debug.onDidStartDebugSession to capture ALL new sessions:
  #
  #   vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
  #     // session.configuration — full config object (type, name, dartDefines, args…)
  #     // session.id            — unique session identifier
  #     // session.name          — may be auto-generated for programmatic sessions
  #     // session.type          — e.g. "dart" for Flutter/Patrol
  #   })
  #
  # Patrol sessions: identified by PATROL_TEST_SERVER_PORT in
  # session.configuration.args or session.configuration.dartDefines.
