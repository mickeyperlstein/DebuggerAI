Feature: Attach to a running process
  As an AI agent
  I want to attach vsdbg to an already-running process or service
  So that I can debug production-like environments without restarting them

  Background:
    Given vsdbg is installed and available on PATH
    And a target process is already running

  # ─── Attach via launch.json ───────────────────────────────────────────────

  Scenario: Attach using a named "attach" configuration from launch.json
    Given launch.json contains:
      """
      { "name": "Attach to Flask", "type": "python", "request": "attach", "port": 5678 }
      """
    When I run:
      """
      vsdbg --config "Attach to Flask"
      """
    Then vsdbg connects to the already-running debugpy server on port 5678
    And pauses at the current execution point
    And the (vsdbg) prompt is available

  Scenario: Attach to a Node.js process listening on --inspect port
    Given a Node.js process is running with --inspect=9229
    And launch.json has: type=node, request=attach, port=9229
    When I run:
      """
      vsdbg --config "Attach Node"
      """
    Then vsdbg connects to the Node.js inspector on port 9229
    And the (vsdbg) prompt is available

  # ─── Quick attach shortcuts ───────────────────────────────────────────────

  Scenario: Attach to a process by port (Python/debugpy)
    When I run:
      """
      vsdbg --attach --port 5678
      """
    Then vsdbg infers type=python and connects to debugpy on 127.0.0.1:5678
    And the (vsdbg) prompt is available

  Scenario: Attach to a process by PID
    Given a Python process with PID 12345 is running with debugpy enabled
    When I run:
      """
      vsdbg --attach --pid 12345
      """
    Then vsdbg attaches to PID 12345
    And the (vsdbg) prompt is available

  Scenario: Attach to a remote host
    When I run:
      """
      vsdbg --attach --host 10.0.0.5 --port 5678
      """
    Then vsdbg connects to the debugpy server on 10.0.0.5:5678
    And warns if the connection is not tunneled (security reminder)
    And the (vsdbg) prompt is available

  # ─── Detach ───────────────────────────────────────────────────────────────

  Scenario: Detach from an attached process — process continues running (pdb: q on attach)
    Given vsdbg is attached to a running process
    When I type:
      """
      q
      """
    Then vsdbg detaches cleanly
    And the target process continues running without the debugger
    And vsdbg exits with status code 0

  # ─── Error cases ─────────────────────────────────────────────────────────

  Scenario: Fail when no process is listening on the given port
    When I run:
      """
      vsdbg --attach --port 5678
      """
    And no process is listening on port 5678
    Then vsdbg exits with a non-zero status code
    And stderr contains:
      """
      error: could not connect to 127.0.0.1:5678 — is the target process running with a debug adapter?
      """

  Scenario: Fail when PID does not exist
    When I run:
      """
      vsdbg --attach --pid 99999
      """
    Then vsdbg exits with a non-zero status code
    And stderr contains:
      """
      error: no process with PID 99999
      """
