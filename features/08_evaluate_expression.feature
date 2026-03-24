Feature: Evaluate expressions — pdb-compatible ! and exec commands
  As an AI agent or developer familiar with pdb
  I want to evaluate and execute arbitrary expressions in the current frame
  So that I can compute values, call functions, and mutate state mid-session

  Background:
    Given vsdbg is running with a session paused at app.py:42
    And current frame locals: x=10, items=[1,2,3], user={"id": 7}
    And the prompt shows "(vsdbg)"

  # ─── p — print expression result ─────────────────────────────────────────

  Scenario: Evaluate an arithmetic expression
    When I type:
      """
      p x * 3 + 1
      """
    Then the output is:
      """
      31
      """

  Scenario: Evaluate a method call
    When I type:
      """
      p items.count(1)
      """
    Then the output is:
      """
      1
      """

  Scenario: Evaluate a dict access
    When I type:
      """
      p user["id"]
      """
    Then the output is:
      """
      7
      """

  # ─── ! — execute a statement (pdb: !stmt) ────────────────────────────────

  Scenario: Mutate a variable in the current frame (pdb: !stmt)
    When I type:
      """
      !x = 99
      """
    Then the local variable "x" is set to 99 in the current frame
    And the next "p x" returns 99
    And vsdbg outputs nothing (silent success, matching pdb behavior)

  Scenario: Call a function as a statement
    When I type:
      """
      !items.append(99)
      """
    Then 99 is appended to "items" in the current frame
    And "p items" returns "[1, 2, 3, 99]"

  Scenario: Execute a multi-line statement with exec
    When I type:
      """
      !exec("for i in range(3): print(i)")
      """
    Then the output is:
      """
      0
      1
      2
      """

  # ─── Bare expressions without p prefix ───────────────────────────────────

  Scenario: Any line not matching a pdb command is treated as a Python expression
    When I type:
      """
      x + 5
      """
    Then vsdbg evaluates it and prints:
      """
      15
      """
    And does NOT confuse it with a debugger command

  Scenario: Disambiguate from debugger commands using ! prefix
    Given "c" would normally mean "continue"
    When I type:
      """
      !c = 42
      """
    Then vsdbg treats it as "set local variable c to 42"
    And does NOT continue execution

  # ─── Error handling ───────────────────────────────────────────────────────

  Scenario: Evaluate an expression that raises an exception
    When I type:
      """
      p 1 / 0
      """
    Then the output is:
      """
      *** ZeroDivisionError: division by zero
      """
    And vsdbg remains at the same prompt (does not crash or exit)

  Scenario: Evaluate an expression referencing an undefined name
    When I type:
      """
      p undefined_var
      """
    Then the output is:
      """
      *** NameError: name 'undefined_var' is not defined
      """

  # ─── Adapter-agnostic ────────────────────────────────────────────────────

  Scenario: Evaluate an expression in a Node.js session
    Given vsdbg is running a Node.js session
    And the current frame has local "req.method = 'GET'"
    When I type:
      """
      p req.method
      """
    Then the output is:
      """
      'GET'
      """
    And the pdb-style evaluate interface works regardless of language
