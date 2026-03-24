Feature: MCP tool interface — vsdbg as a universal tool server
  As an AI agent connected via MCP (Claude, Cline, Cursor, OpenCode, local LLMs)
  I want to call vsdbg debug operations as MCP tools
  So that any tool-capable agent can drive the debugger without knowing bash or pdb syntax

  Background:
    Given vsdbg MCP server is running (default port 7890)
    And the MCP client has connected and received the tool manifest

  # ─── Tool manifest ────────────────────────────────────────────────────────

  Scenario: List available MCP tools
    When the MCP client requests the tool list
    Then the response includes these tools:
      | tool name            | description                                          |
      | vsdbg_start          | Start a debug session from a launch.json config      |
      | vsdbg_stop           | Stop (quit) the active debug session                 |
      | vsdbg_continue       | Continue execution until the next breakpoint         |
      | vsdbg_step_over      | Step over the current line (n)                       |
      | vsdbg_step_in        | Step into a function call (s)                        |
      | vsdbg_step_out       | Step out of the current function (r)                 |
      | vsdbg_set_breakpoint | Set a breakpoint at a file/line with optional condition |
      | vsdbg_clear_breakpoint | Clear a breakpoint by ID or location               |
      | vsdbg_list_breakpoints | List all active breakpoints                        |
      | vsdbg_inspect        | Inspect a variable or expression (p/pp)              |
      | vsdbg_backtrace      | Get the current call stack (bt)                      |
      | vsdbg_status         | Get session state as structured JSON                 |
      | vsdbg_list_configs   | List all launch.json configurations                  |
      | vsdbg_run_to         | Run to a specific line (tbreak + continue)           |

  # ─── vsdbg_start ──────────────────────────────────────────────────────────

  Scenario: Start a debug session via MCP
    When the agent calls tool "vsdbg_start" with:
      """
      { "config": "Debug Backend" }
      """
    Then vsdbg launches the "Debug Backend" configuration
    And the tool returns:
      """
      {
        "session_id": "session-001",
        "state": "paused",
        "config": "Debug Backend",
        "adapter": "node",
        "file": "src/index.js",
        "line": 1
      }
      """

  Scenario: Start with default config (no argument)
    When the agent calls "vsdbg_start" with no arguments
    Then vsdbg uses the first configuration in launch.json
    And returns the same structured response

  # ─── vsdbg_set_breakpoint ─────────────────────────────────────────────────

  Scenario: Set a breakpoint via MCP
    When the agent calls "vsdbg_set_breakpoint" with:
      """
      { "file": "app.py", "line": 42 }
      """
    Then the tool returns:
      """
      { "breakpoint_id": 1, "file": "app.py", "line": 42, "enabled": true }
      """

  Scenario: Set a conditional breakpoint via MCP
    When the agent calls "vsdbg_set_breakpoint" with:
      """
      { "file": "app.py", "line": 42, "condition": "x > 100" }
      """
    Then the tool returns:
      """
      { "breakpoint_id": 2, "file": "app.py", "line": 42, "condition": "x > 100", "enabled": true }
      """

  # ─── vsdbg_continue / step ───────────────────────────────────────────────

  Scenario: Continue execution via MCP
    When the agent calls "vsdbg_continue" with no arguments
    Then execution resumes
    And when the next breakpoint is hit, the tool returns:
      """
      { "state": "paused", "file": "app.py", "line": 42, "reason": "breakpoint", "breakpoint_id": 1 }
      """

  Scenario: Step over via MCP
    When the agent calls "vsdbg_step_over" with no arguments
    Then the tool returns the new paused location:
      """
      { "state": "paused", "file": "app.py", "line": 43 }
      """

  # ─── vsdbg_inspect ───────────────────────────────────────────────────────

  Scenario: Inspect a variable via MCP
    When the agent calls "vsdbg_inspect" with:
      """
      { "expression": "user_id" }
      """
    Then the tool returns:
      """
      { "expression": "user_id", "value": 7, "type": "int" }
      """

  Scenario: Inspect locals() via MCP
    When the agent calls "vsdbg_inspect" with:
      """
      { "expression": "locals()" }
      """
    Then the tool returns a JSON object of all local variables

  # ─── vsdbg_backtrace ─────────────────────────────────────────────────────

  Scenario: Get call stack via MCP
    When the agent calls "vsdbg_backtrace" with no arguments
    Then the tool returns:
      """
      {
        "frames": [
          { "index": 0, "file": "/app/handlers.py", "line": 42, "function": "process_request" },
          { "index": 1, "file": "/app/routes.py",   "line": 24, "function": "handle_route" },
          { "index": 2, "file": "/app/main.py",     "line": 1,  "function": "<module>" }
        ],
        "current_frame": 0
      }
      """

  # ─── Error responses ─────────────────────────────────────────────────────

  Scenario: MCP tool returns structured error when session is not active
    Given no debug session is running
    When the agent calls "vsdbg_continue"
    Then the tool returns an MCP error:
      """
      { "error": "no_active_session", "message": "No debug session is currently active. Call vsdbg_start first." }
      """

  Scenario: MCP tool returns structured error for invalid expression
    When the agent calls "vsdbg_inspect" with:
      """
      { "expression": "undefined_var" }
      """
    Then the tool returns:
      """
      { "error": "NameError", "message": "name 'undefined_var' is not defined" }
      """
    And the session remains active (error does not terminate the session)
