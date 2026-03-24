Feature: Manage breakpoints — pdb-compatible interface
  As an AI agent or developer familiar with pdb
  I want to set, list, clear, and conditionally trigger breakpoints
  using the exact same commands as pdb
  So that anyone who knows pdb feels immediately at home

  Background:
    Given vsdbg is running with app.py paused at line 1
    And the prompt shows "(vsdbg)"

  # ─── CLI shorthand: vsdbg +bp ────────────────────────────────────────────
  # Compact one-liner for agents and scripts — no REPL session required

  Scenario: Set a breakpoint via CLI shorthand (no condition)
    When I run from the shell:
      """
      vsdbg +bp app.py:42
      """
    Then a breakpoint is registered at app.py:42 in the active session
    And the output is:
      """
      Breakpoint 1 at app.py:42
      """

  Scenario: Set a conditional breakpoint via CLI shorthand
    When I run from the shell:
      """
      vsdbg +bp app.py:42 condition:{x > 100}
      """
    Then a conditional breakpoint is registered at app.py:42
    And the condition "x > 100" is attached
    And the output is:
      """
      Breakpoint 1 at app.py:42 (condition: x > 100)
      """

  Scenario: Condition {True} is equivalent to an unconditional breakpoint
    When I run:
      """
      vsdbg +bp app.py:42 condition:{True}
      """
    Then a breakpoint is set that always triggers (True is always truthy)
    And it behaves identically to "vsdbg +bp app.py:42" with no condition

  Scenario: Set a breakpoint with a complex condition
    When I run:
      """
      vsdbg +bp handlers.py:99 condition:{user_id is not None and status == "active"}
      """
    Then a conditional breakpoint is registered at handlers.py:99
    And it only fires when both "user_id is not None" and "status == 'active'" are True

  Scenario: +bp shorthand works for any file type supported by the active adapter
    When I run:
      """
      vsdbg +bp src/index.js:30 condition:{req.method === "POST"}
      """
    Then a conditional breakpoint is registered in the Node.js debug session
    And the condition uses the target language's expression syntax (JavaScript here)

  Scenario: +bp with no active session pre-registers the breakpoint for next start
    Given no debug session is currently active
    When I run:
      """
      vsdbg +bp app.py:42 condition:{x > 100}
      """
    Then vsdbg stores the breakpoint in its pending list
    And on the next "vsdbg --config ..." start, the breakpoint is applied automatically
    And the output is:
      """
      Breakpoint queued at app.py:42 (condition: x > 100) — will apply on next session start
      """

  # ─── Setting breakpoints (REPL, pdb-compatible) ──────────────────────────

  Scenario: Set a breakpoint at a line in the current file (pdb: b lineno)
    When I type:
      """
      b 42
      """
    Then output is:
      """
      Breakpoint 1 at app.py:42
      """
    And execution will pause at app.py:42 on next hit

  Scenario: Set a breakpoint at a line in another file (pdb: b filename:lineno)
    When I type:
      """
      b utils.py:15
      """
    Then output is:
      """
      Breakpoint 2 at utils.py:15
      """

  Scenario: Set a breakpoint at a function (pdb: b funcname)
    When I type:
      """
      b process_request
      """
    Then a breakpoint is set at the first executable line of "process_request"
    And output is:
      """
      Breakpoint 3 at app.py:67 (process_request)
      """

  Scenario: Set a conditional breakpoint (pdb: b lineno, condition)
    When I type:
      """
      b 42, x > 100
      """
    Then a conditional breakpoint is set at app.py:42
    And execution only pauses there when "x > 100" is True
    And output is:
      """
      Breakpoint 4 at app.py:42 (condition: x > 100)
      """

  # ─── Listing breakpoints ───────────────────────────────────────────────────

  Scenario: List all breakpoints (pdb: b with no args)
    Given breakpoints are set at app.py:42 and utils.py:15
    When I type:
      """
      b
      """
    Then the output is a table matching pdb format:
      """
      Num Type         Disp Enb   Where
      1   breakpoint   keep yes   at app.py:42
      2   breakpoint   keep yes   at utils.py:15
      """

  Scenario: List breakpoints when none are set
    When I type:
      """
      b
      """
    Then the output is:
      """
      (no breakpoints)
      """

  # ─── Clearing breakpoints ──────────────────────────────────────────────────

  Scenario: Clear a breakpoint by number (pdb: cl bpnumber)
    Given breakpoint 1 is set at app.py:42
    When I type:
      """
      cl 1
      """
    Then output is:
      """
      Deleted breakpoint 1 at app.py:42
      """
    And execution no longer pauses at app.py:42

  Scenario: Clear a breakpoint by location (pdb: cl filename:lineno)
    When I type:
      """
      cl app.py:42
      """
    Then all breakpoints at app.py:42 are deleted
    And the output confirms each deleted breakpoint

  Scenario: Clear all breakpoints with confirmation (pdb: cl with no args)
    When I type:
      """
      cl
      """
    Then vsdbg prompts:
      """
      Clear all breaks? (y/n)
      """
    And when I answer "y", all breakpoints are removed
    And output is:
      """
      Cleared all breakpoints.
      """

  # ─── Disable / Enable ──────────────────────────────────────────────────────

  Scenario: Disable a breakpoint without removing it (pdb: disable bpnumber)
    Given breakpoint 1 is active at app.py:42
    When I type:
      """
      disable 1
      """
    Then breakpoint 1 is marked disabled (Enb = no)
    And execution passes through app.py:42 without pausing
    And "b" lists it with "Enb = no"

  Scenario: Re-enable a disabled breakpoint (pdb: enable bpnumber)
    Given breakpoint 1 is disabled
    When I type:
      """
      enable 1
      """
    Then breakpoint 1 is marked enabled (Enb = yes)
    And execution pauses at app.py:42 on the next hit

  # ─── Ignore count ──────────────────────────────────────────────────────────

  Scenario: Ignore a breakpoint N times before pausing (pdb: ignore bpnumber count)
    When I type:
      """
      ignore 1 5
      """
    Then breakpoint 1 will be skipped the next 5 times it is hit
    And on the 6th hit execution will pause
    And "b" shows "ignore next 5 hits" in the breakpoint table

  # ─── Tbreak ────────────────────────────────────────────────────────────────

  Scenario: Set a one-shot temporary breakpoint (pdb: tbreak)
    When I type:
      """
      tbreak 80
      """
    Then a temporary breakpoint is set at app.py:80
    And it fires once on the next hit
    And it is automatically removed after firing
    And "b" shows "Disp = del" before it fires
