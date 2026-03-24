Feature: Session status and info commands
  As an AI agent driving vsdbg via bash
  I want to query the current state of the debug session in a machine-readable format
  So that I can make decisions based on what the debugger reports without parsing human text

  Background:
    Given vsdbg is running with app.py paused at line 42
    And the prompt shows "(vsdbg)"

  # ─── w / where — current location (pdb-compatible) ───────────────────────

  Scenario: Show current execution location (pdb: w / where)
    When I type:
      """
      w
      """
    Then the output matches pdb "where" format:
      """
        /app/main.py(1)<module>()
      -> app.run()
      > /app/handlers.py(42)process_request()
      -> validated = validate(data)
      """

  # ─── status command (vsdbg extension, machine-readable) ──────────────────

  Scenario: Get machine-readable session status as JSON
    When I type:
      """
      status
      """
    Then the output is JSON:
      """
      {
        "state": "paused",
        "config": "Debug Backend",
        "adapter": "python",
        "file": "/app/handlers.py",
        "line": 42,
        "function": "process_request",
        "breakpoints": 3,
        "session_id": "session-001",
        "pid": 12345
      }
      """

  Scenario: Status when no session is active
    Given no vsdbg session is running
    When I run:
      """
      vsdbg status
      """
    Then the output is JSON:
      """
      { "state": "idle", "session_id": null }
      """
    And the exit code is 0

  Scenario: Status when session is running (not paused)
    Given execution is currently running between breakpoints
    When I type:
      """
      status
      """
    Then the output is JSON with "state": "running"
    And "file" and "line" are null (not yet paused)

  Scenario: Status when session has exited
    Given the debugged program exited naturally
    When I type:
      """
      status
      """
    Then the output is JSON:
      """
      { "state": "exited", "exit_code": 0, "session_id": "session-001" }
      """

  # ─── args — print function arguments (pdb: a) ────────────────────────────

  Scenario: Print the current function's argument values (pdb: a)
    Given the current frame is inside "process_request(req, timeout=30)"
    When I type:
      """
      a
      """
    Then the output is:
      """
      req = <Request 'POST /api/v1/users'>
      timeout = 30
      """

  # ─── retval — show last return value (pdb: rv) ───────────────────────────

  Scenario: Show the return value after stepping out of a function (pdb: rv)
    Given I just typed "r" (return) and stepped out of "validate()"
    When I type:
      """
      rv
      """
    Then the output is:
      """
      {'status': 'ok', 'data': {'id': 7}}
      """

  # ─── Exceptions ───────────────────────────────────────────────────────────

  Scenario: Show the last exception (pdb: p __exception__)
    Given execution stopped due to an unhandled exception
    When I type:
      """
      p __exception__
      """
    Then the output shows the exception type and message:
      """
      (<class 'ValueError'>, ValueError('invalid user id'))
      """
