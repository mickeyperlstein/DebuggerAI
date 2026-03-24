Feature: Source listing — pdb-compatible l and ll commands
  As an AI agent or developer familiar with pdb
  I want to view the source code around the current execution point
  using pdb's l and ll commands
  So that I always know exactly where I am in the code

  Background:
    Given vsdbg is running with a session paused at app.py:42
    And the prompt shows "(vsdbg)"

  # ─── l — list source ─────────────────────────────────────────────────────

  Scenario: List 11 lines around the current line (pdb: l)
    When I type:
      """
      l
      """
    Then the output shows 11 lines centered on line 42:
      """
       37
       38     def process_request(req):
       39         data = req.get_json()
       40         if not data:
       41             return error(400)
       42  ->     validated = validate(data)
       43         result = transform(validated)
       44         return jsonify(result), 200
       45
       46
       47     def validate(data):
      """
    And the current line is marked with "->"

  Scenario: List continues from where it left off on second call (pdb behavior)
    Given I already typed "l" and saw lines 37–47
    When I type "l" again
    Then the output shows the next 11 lines (48–58)
    And does NOT re-show lines 37–47

  Scenario: List a specific line range (pdb: l first, last)
    When I type:
      """
      l 1, 10
      """
    Then the output shows lines 1 through 10 of the current file

  Scenario: List around a specific line number (pdb: l lineno)
    When I type:
      """
      l 80
      """
    Then the output shows 11 lines centered on line 80

  Scenario: List resets position after a step or continue
    Given I typed "l" twice and exhausted the listing
    When I type "n" to step to line 43
    Then the next "l" command re-centers on line 43
    And does NOT continue from where the previous listing left off

  # ─── ll — longlist (entire function) ─────────────────────────────────────

  Scenario: List the entire current function (pdb: ll)
    When I type:
      """
      ll
      """
    Then the output shows the complete source of the current function from its def to its last line
    And the current line is marked with "->"

  Scenario: ll in a module-level scope lists more context
    Given execution is paused at module level (not inside a function)
    When I type:
      """
      ll
      """
    Then the output shows the full module source

  # ─── Adapter-agnostic ────────────────────────────────────────────────────

  Scenario: l works in a Node.js session
    Given vsdbg is running a Node.js session paused at src/index.js:15
    When I type:
      """
      l
      """
    Then the output shows 11 lines of JavaScript centered on line 15
    And the current line is marked with "->"

  Scenario: l works in a Go session
    Given vsdbg is running a Go session paused at main.go:25
    When I type:
      """
      l
      """
    Then the output shows 11 lines of Go source centered on line 25
