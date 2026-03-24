Feature: Quit a vsdbg session
  As an AI agent
  I want to quit a debug session cleanly
  So that the process terminates and resources are freed

  Background:
    Given vsdbg is running with app.py paused at line 42
    And the prompt shows "(vsdbg)"

  Scenario: Quit the session with the q command (pdb-compatible)
    When I type at the prompt:
      """
      q
      """
    Then the debugged program is terminated
    And vsdbg exits with status code 0
    And the shell prompt is restored

  Scenario: Quit with the full spelling
    When I type at the prompt:
      """
      quit
      """
    Then the debugged program is terminated
    And vsdbg exits with status code 0

  Scenario: Quit when the program has already exited naturally
    Given the debugged program reached its last line and exited
    When I type:
      """
      q
      """
    Then vsdbg exits cleanly
    And reports the program's exit code

  Scenario: Quit via EOF (Ctrl+D) — bash agent pipe closes stdin
    Given an AI agent is piping commands to vsdbg via stdin
    When stdin is closed (EOF)
    Then vsdbg treats it as "q"
    And exits cleanly without hanging

  Scenario: Quit via SIGINT (Ctrl+C)
    When a SIGINT signal is sent to vsdbg
    Then vsdbg prompts "Really quit? (y/n)" or exits immediately depending on --no-confirm flag
    And the debugged process is terminated

  Scenario: Quit all detaches from an attached process without killing it
    Given vsdbg was attached to a running process (not launched by vsdbg)
    When I type:
      """
      q
      """
    Then vsdbg detaches cleanly
    And the target process continues running normally
    And vsdbg exits with status code 0
