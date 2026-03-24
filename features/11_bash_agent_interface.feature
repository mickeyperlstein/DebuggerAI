Feature: Bash agent interface — driving vsdbg non-interactively via stdin pipe
  As a bash-based AI agent (Claude Code, shell scripts, automated tools)
  I want to drive vsdbg by piping commands to stdin
  So that I can automate debugging workflows without a human at the keyboard

  Background:
    Given vsdbg is installed and available on PATH
    And app.py contains a bug that manifests at line 55

  # ─── Piping a command sequence ────────────────────────────────────────────

  Scenario: Pipe a sequence of pdb commands to vsdbg
    When I run:
      """
      printf "b 55\nc\np user_id\nq\n" | vsdbg app.py
      """
    Then vsdbg executes each command in order:
      1. Sets breakpoint at line 55
      2. Continues until line 55 is hit
      3. Prints the value of "user_id"
      4. Quits
    And each command's output is written to stdout
    And vsdbg exits with status code 0

  Scenario: Pipe using a here-doc
    When I run:
      """
      vsdbg app.py <<'EOF'
      b 55
      c
      p user_id
      p items
      q
      EOF
      """
    Then vsdbg processes all commands sequentially
    And stdout contains the results of each p command
    And vsdbg exits cleanly after "q"

  Scenario: Pass commands via --commands flag (for agents that prefer flags)
    When I run:
      """
      vsdbg --commands "b 55; c; p user_id; q" app.py
      """
    Then vsdbg executes the semicolon-separated commands in order
    And produces the same output as the piped version

  Scenario: Pass a command file via --command-file
    Given a file "debug_script.vsdbg" contains:
      """
      b 55
      c
      p user_id
      q
      """
    When I run:
      """
      vsdbg --command-file debug_script.vsdbg app.py
      """
    Then vsdbg executes all commands in the file sequentially
    And exits cleanly after "q"

  # ─── Machine-readable output ─────────────────────────────────────────────

  Scenario: Run in machine-readable JSON output mode
    When I run:
      """
      vsdbg --json app.py <<'EOF'
      b 55
      c
      p user_id
      status
      q
      EOF
      """
    Then every response from vsdbg is a JSON object on its own line (JSONL format):
      """
      {"cmd":"b","args":"55","result":{"breakpoint_id":1,"file":"app.py","line":55}}
      {"cmd":"c","result":{"state":"paused","file":"app.py","line":55}}
      {"cmd":"p","args":"user_id","result":{"value":7,"type":"int"}}
      {"cmd":"status","result":{"state":"paused","file":"app.py","line":55,"function":"main"}}
      {"cmd":"q","result":{"state":"exited","exit_code":0}}
      """
    And no human-readable text is mixed into stdout

  Scenario: Errors in JSON mode are also JSON objects
    When a command fails in --json mode
    Then the error is reported as:
      """
      {"cmd":"p","args":"nonexistent","error":{"type":"NameError","message":"name 'nonexistent' is not defined"}}
      """
    And vsdbg continues processing subsequent commands (does not abort)

  # ─── Timeout handling ────────────────────────────────────────────────────

  Scenario: vsdbg does not hang waiting for a breakpoint that is never hit
    When I run with a timeout flag:
      """
      vsdbg --timeout 10s app.py <<'EOF'
      b 9999
      c
      p user_id
      q
      EOF
      """
    And line 9999 is never reached within 10 seconds
    Then vsdbg pauses execution after 10 seconds
    And outputs:
      """
      {"event":"timeout","message":"execution did not reach breakpoint within 10s — pausing"}
      """
    And the (vsdbg) prompt is still available for further commands

  # ─── Exit codes ──────────────────────────────────────────────────────────

  Scenario: Exit code 0 on clean quit
    When vsdbg exits after a "q" command
    Then the exit code is 0

  Scenario: Exit code 1 on startup error (file not found, adapter missing)
    When vsdbg cannot start
    Then the exit code is 1
    And a JSON error is written to stderr

  Scenario: Exit code matches the debugged program's exit code (--propagate-exit-code)
    When I run:
      """
      vsdbg --propagate-exit-code --commands "c;q" app.py
      """
    And app.py exits with code 42
    Then vsdbg itself exits with code 42

  # ─── Scripted debugging workflow example ─────────────────────────────────

  Scenario: Full automated bug-finding workflow driven by an AI agent
    Given the AI agent wants to inspect state at lines 30, 55, and 80 of app.py
    When the agent runs:
      """
      vsdbg --json app.py <<'EOF'
      b 30
      b 55
      b 80
      c
      p locals()
      c
      p locals()
      c
      p locals()
      q
      EOF
      """
    Then vsdbg produces three separate JSONL snapshots of locals() at each breakpoint
    And the agent parses the JSON output to understand the state at each point
    And vsdbg exits cleanly
