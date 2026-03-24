Feature: Execution control — pdb-compatible step/continue/pause commands
  As an AI agent or developer familiar with pdb
  I want to control execution using the exact pdb command set
  So that n, s, c, r, u, d, and unt work exactly as they do in pdb

  Background:
    Given vsdbg is running with app.py paused at line 42
    And the prompt shows "(vsdbg)"

  # ─── n — next (step over) ──────────────────────────────────────────────────

  Scenario: Step over the current line (pdb: n)
    When I type:
      """
      n
      """
    Then the current line executes completely (including any called functions)
    And the prompt advances to the next line in the same frame:
      """
      > app.py(43)<module>()
      -> result = transform(data)
      (vsdbg)
      """

  Scenario: Next stops at a breakpoint inside a called function if one is set
    Given breakpoint 1 is set at utils.py:5 inside "helper()"
    And line 42 calls "helper()"
    When I type:
      """
      n
      """
    Then execution enters helper() and pauses at utils.py:5
    And the prompt shows the breakpoint location

  # ─── s — step (step into) ──────────────────────────────────────────────────

  Scenario: Step into a function call (pdb: s)
    Given line 42 contains "result = process(data)"
    When I type:
      """
      s
      """
    Then execution enters the "process" function
    And the prompt shows the first executable line inside "process":
      """
      > utils.py(5)process()
      -> validated = validate(data)
      (vsdbg)
      """

  Scenario: Step into a built-in — falls back to next line (expected pdb behavior)
    Given line 42 contains "x = len(items)"
    When I type:
      """
      s
      """
    Then vsdbg cannot step into the built-in "len"
    And advances to the next line (same as n)

  # ─── r — return (step out) ─────────────────────────────────────────────────

  Scenario: Run to the end of the current function and return to caller (pdb: r)
    Given the current frame is inside "process" at utils.py:8
    When I type:
      """
      r
      """
    Then execution runs to the end of "process"
    And the prompt returns to the caller frame:
      """
      > app.py(42)<module>()
      -> result = process(data)
      (vsdbg)
      """
    And the return value is shown:
      """
      --Return--
      > utils.py(12)process()->{'status': 'ok'}
      """

  # ─── c — continue ──────────────────────────────────────────────────────────

  Scenario: Continue execution until next breakpoint (pdb: c / cont / continue)
    Given breakpoint 1 is set at app.py:80
    When I type:
      """
      c
      """
    Then execution resumes and runs until app.py:80 is hit
    And the prompt shows:
      """
      > app.py(80)<module>()
      -> send_response(result)
      (vsdbg)
      Breakpoint 1, <module>() at app.py:80
      """

  Scenario: Continue until end of program (no breakpoints)
    Given no breakpoints are set
    When I type:
      """
      c
      """
    Then the program runs to completion
    And vsdbg shows the exit code and exits

  Scenario: "cont" and "continue" are accepted aliases
    When I type "cont" or "continue"
    Then vsdbg behaves identically to typing "c"

  # ─── unt — until ───────────────────────────────────────────────────────────

  Scenario: Run until a specific line number in the current frame (pdb: unt lineno)
    When I type:
      """
      unt 60
      """
    Then execution runs until line 60 of the current file is reached
    And if line 60 is not reachable from the current path, execution continues normally
    And a temporary breakpoint is used internally (not shown to user)

  # ─── j — jump ──────────────────────────────────────────────────────────────

  Scenario: Jump to a different line without executing skipped lines (pdb: j lineno)
    When I type:
      """
      j 50
      """
    Then the next line to execute becomes app.py:50
    And lines 43–49 are skipped entirely
    And the prompt shows:
      """
      > app.py(50)<module>()
      """

  Scenario: Jump is refused across function boundaries
    When I type:
      """
      j 5
      """
    And line 5 is inside a different function than the current frame
    Then vsdbg outputs:
      """
      Jump error: cannot jump to different function
      """

  # ─── Repeated command (Enter key repeats last command) ─────────────────────

  Scenario: Pressing Enter repeats the last command (pdb behavior)
    Given the last command was "n"
    When I press Enter at the "(vsdbg)" prompt (empty input)
    Then vsdbg executes "n" again
    And advances another line
