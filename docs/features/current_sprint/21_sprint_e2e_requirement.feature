Feature: sprint closure — mandatory full e2e of the SUT

  Every sprint MUST close with a passing end-to-end test of the full
  System Under Test (SUT). This is non-negotiable.

  The e2e test plays the role of the AI agent — it IS the AI in the test.
  It must exercise the complete stack with no mocks, no fake events,
  no hardcoded variable values.

  # ─── Definition of done ──────────────────────────────────────────────────────

  Scenario: A sprint is NOT done until e2e passes
    Given a sprint's unit tests are 100% passing
    And the VS Code extension tests are passing
    When there is no passing e2e test of the full SUT
    Then the sprint is NOT closed
    And no PR is merged until the e2e test exists and passes

  # ─── What "full e2e" means ───────────────────────────────────────────────────

  Scenario: Full e2e exercises the complete stack
    Given a real VS Code instance with the DebuggingAI extension installed
    And a real target process being debugged (not mocked)
    When the e2e test runs
    Then it drives the debugger via the MCP tools or HTTP API (port 7890)
    And it reads real variable values from the running process
    And it observes real bus events from the BusRouter
    And all assertions are on real runtime data — not hardcoded values

  # ─── The AI role ─────────────────────────────────────────────────────────────

  Scenario: The e2e test plays the role of the AI agent
    Given the e2e test is running
    Then it behaves as an AI agent would:
      | Step | Action |
      | 1    | Connect to the bus, subscribe to "*" |
      | 2    | Discover active sessions from bus events |
      | 3    | Attach to each session |
      | 4    | Set breakpoints |
      | 5    | Inspect real variable values at breakpoints |
      | 6    | Reason about what it finds (assert expected state) |
      | 7    | Take action (step, continue, patch, rerun) |
      | 8    | Verify the outcome |

  # ─── Logging requirement ─────────────────────────────────────────────────────

  Scenario: e2e test output narrates the AI's reasoning
    Given the e2e test is running
    Then it logs each step in AI voice:
      | [AI] Connecting to bus...                          |
      | [AI] Sessions discovered: ["server", "client"]     |
      | [AI] Breakpoint hit: client.ts:46                  |
      | [AI] obj.token = null — bug identified             |
      | [AI] Patching client.ts...                         |
      | [AI] Token flows end-to-end ✓                      |
    And this output is the demo reel

  # ─── Transport ───────────────────────────────────────────────────────────────

  Scenario: e2e runs via vscode-extension-tester (current)
    Given DebuggingAI currently depends on VS Code for DAP
    Then the e2e test uses npm run test:e2e
    And it runs inside a real VS Code instance via vscode-extension-tester
    And it does NOT implement its own DAP/CDP client (that is a future sprint)

  # ─── Future ──────────────────────────────────────────────────────────────────

  # When the standalone DAP client sprint ships:
  # - e2e will no longer require VS Code
  # - Tests will connect directly to Node/Python debugger via DAP
  # - vscode-extension-tester becomes optional
