Feature: Call stack navigation — pdb-compatible bt, u, d, w commands
  As an AI agent or developer familiar with pdb
  I want to inspect and navigate the call stack
  using the exact pdb commands bt, where, u, d
  So that understanding the execution path is immediate and familiar

  Background:
    Given vsdbg is running with a session paused inside function "process_request"
    And the call stack is: [process_request (frame 0), handle_route (frame 1), main (frame 2)]
    And the prompt shows "(vsdbg)"

  # ─── bt / where — print stack trace ─────────────────────────────────────

  Scenario: Print the full stack trace (pdb: bt)
    When I type:
      """
      bt
      """
    Then the output matches pdb backtrace format:
      """
        /app/main.py(1)<module>()
      -> app.run()
        /app/routes.py(24)handle_route()
      -> result = process_request(req)
      > /app/handlers.py(67)process_request()
      -> validated = validate(req.body)
      """
    And the current frame is marked with ">"

  Scenario: "where" is an alias for bt (pdb behavior)
    When I type:
      """
      where
      """
    Then the output is identical to "bt"

  Scenario: Print a limited number of frames (pdb: bt count)
    When I type:
      """
      bt 2
      """
    Then only the innermost 2 frames are shown

  Scenario: Negative count shows outermost frames (pdb: bt -count)
    When I type:
      """
      bt -2
      """
    Then only the outermost 2 frames are shown

  # ─── u — move up the call stack ──────────────────────────────────────────

  Scenario: Move up one frame toward the caller (pdb: u)
    When I type:
      """
      u
      """
    Then the current frame moves to frame 1 (handle_route)
    And the prompt shows:
      """
      > /app/routes.py(24)handle_route()
      -> result = process_request(req)
      (vsdbg)
      """
    And "p" and "l" commands now operate on the handle_route frame

  Scenario: Move up multiple frames at once (pdb: u count)
    When I type:
      """
      u 2
      """
    Then the current frame moves 2 levels up to frame 2 (main)

  Scenario: Move up beyond the outermost frame is a no-op with a warning
    Given the current frame is already at the outermost frame (main)
    When I type:
      """
      u
      """
    Then the output is:
      """
      Oldest frame
      """
    And the frame position does not change

  # ─── d — move down the call stack ────────────────────────────────────────

  Scenario: Move down one frame toward the current execution point (pdb: d)
    Given the current frame is frame 1 (handle_route, after typing u)
    When I type:
      """
      d
      """
    Then the current frame returns to frame 0 (process_request)
    And the prompt shows the process_request context

  Scenario: Move down multiple frames at once (pdb: d count)
    Given the current frame is frame 2 (main)
    When I type:
      """
      d 2
      """
    Then the current frame moves 2 levels down to frame 0

  Scenario: Move down beyond the innermost frame is a no-op with a warning
    Given the current frame is already at frame 0 (process_request)
    When I type:
      """
      d
      """
    Then the output is:
      """
      Newest frame
      """
    And the frame position does not change

  # ─── Frame context for variable inspection ───────────────────────────────

  Scenario: Inspecting locals after moving up the stack
    Given I moved up to frame 1 (handle_route) by typing "u"
    When I type:
      """
      p req
      """
    Then the output shows the "req" variable as it exists in handle_route
    And NOT the variables from process_request

  Scenario: Stack trace works for any adapter (Node, Go, Python)
    Given vsdbg is running a Node.js session paused in "processRequest"
    When I type:
      """
      bt
      """
    Then the output shows the JavaScript call stack in pdb backtrace format
    And the same u/d/u2 navigation works for JS frames
