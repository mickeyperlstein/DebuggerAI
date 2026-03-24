Feature: Restart a debug session or restart from a specific frame
  As an AI agent
  I want to restart the entire debug session or rewind to re-execute a frame
  So that I can reproduce bugs without quitting and relaunching manually

  Background:
    Given vsdbg is running with a session paused at app.py:55
    And the prompt shows "(vsdbg)"

  Scenario: Restart the entire session (re-run program from the start)
    When I type:
      """
      restart
      """
    Then the debugged program is relaunched with the same configuration and arguments
    And execution pauses at line 1 again
    And all breakpoints from the previous session are preserved
    And the prompt shows the start of the program

  Scenario: Restart is a vsdbg alias — pdb uses "run" to restart
    When I type:
      """
      run
      """
    Then vsdbg behaves identically to "restart"
    And any arguments passed to "run" override the original launch arguments

  Scenario: Restart preserves breakpoints across restarts
    Given breakpoints are set at app.py:30 and app.py:55
    When I type "restart"
    Then after relaunch, both breakpoints are still active
    And execution pauses at app.py:30 on the next run

  Scenario: Restart from the command line (non-interactive)
    When I run:
      """
      vsdbg --commands "b 55; c; p user_id; restart; c; p user_id; q" app.py
      """
    Then vsdbg runs to line 55, inspects user_id, restarts, runs to line 55 again, inspects user_id again
    And both values are printed to stdout
