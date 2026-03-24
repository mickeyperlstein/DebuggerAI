Feature: Inspect variables — pdb-compatible p, pp, whatis, display commands
  As an AI agent or developer familiar with pdb
  I want to inspect variables using the exact pdb command set
  So that p, pp, whatis, display, and undisplay work exactly as in pdb

  Background:
    Given vsdbg is running with app.py paused at line 42
    And the current frame contains: user_id=7, data={"key": "val"}, items=[1,2,3]
    And the prompt shows "(vsdbg)"

  # ─── p — print expression ─────────────────────────────────────────────────

  Scenario: Print a variable (pdb: p expr)
    When I type:
      """
      p user_id
      """
    Then the output is:
      """
      7
      """

  Scenario: Print a nested object
    When I type:
      """
      p data
      """
    Then the output is:
      """
      {'key': 'val'}
      """

  Scenario: Print an expression
    When I type:
      """
      p user_id * 2 + 1
      """
    Then the output is:
      """
      15
      """

  Scenario: Print an undefined variable returns NameError (pdb behavior)
    When I type:
      """
      p nonexistent_var
      """
    Then the output is:
      """
      *** NameError: name 'nonexistent_var' is not defined
      """
    And vsdbg remains at the same prompt (does not crash)

  # ─── pp — pretty-print ───────────────────────────────────────────────────

  Scenario: Pretty-print a large dict (pdb: pp expr)
    When I type:
      """
      pp data
      """
    Then the output uses pprint formatting with indentation:
      """
      {'key': 'val'}
      """

  Scenario: Pretty-print a deeply nested structure
    Given variable "config" is a deeply nested dict
    When I type:
      """
      pp config
      """
    Then the output is formatted across multiple lines with proper indentation

  # ─── whatis — show type ───────────────────────────────────────────────────

  Scenario: Show the type of a variable (pdb: whatis expr)
    When I type:
      """
      whatis user_id
      """
    Then the output is:
      """
      <class 'int'>
      """

  Scenario: Show the type of a function
    When I type:
      """
      whatis process_request
      """
    Then the output is:
      """
      Function process_request
      """

  # ─── display / undisplay — auto-print on each step ───────────────────────

  Scenario: Auto-display a variable after each step (pdb: display expr)
    When I type:
      """
      display user_id
      """
    Then after every step or continue-pause, vsdbg automatically prints:
      """
      user_id: 7
      """
    And if the value changes, it prints:
      """
      user_id: 8  [was: 7]
      """

  Scenario: Remove an auto-display variable (pdb: undisplay expr)
    Given "user_id" is being displayed after each step
    When I type:
      """
      undisplay user_id
      """
    Then vsdbg stops auto-printing "user_id" after each step

  Scenario: undisplay with no args removes all display expressions (pdb behavior)
    When I type:
      """
      undisplay
      """
    Then all auto-display expressions are cleared

  # ─── Adapter-agnostic note ────────────────────────────────────────────────

  Scenario: Inspect variables in a Node.js session
    Given vsdbg is running a Node.js debug session paused at src/index.js:10
    And a local variable "req" is the Express request object
    When I type:
      """
      p req.method
      """
    Then the output is:
      """
      'GET'
      """
    And the pdb-style p/pp/whatis interface works identically regardless of adapter

  Scenario: Inspect variables in a Go session (via Delve adapter)
    Given vsdbg is running a Go debug session paused at main.go:25
    And a local variable "count" is an int with value 42
    When I type:
      """
      p count
      """
    Then the output is:
      """
      42
      """
