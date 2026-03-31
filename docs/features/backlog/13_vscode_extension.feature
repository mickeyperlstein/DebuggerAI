Feature: VS Code extension — vsdbg commands in the Command Palette
  As a developer or AI agent with VS Code access
  I want vsdbg operations exposed as VS Code commands
  So that Claude Code, Cursor, Copilot Workspace, or any VS Code-aware agent
  can invoke them via the Command Palette without knowing bash or pdb syntax

  Background:
    Given the DebuggingAI VS Code extension is installed and active
    And a workspace is open with a .vscode/launch.json

  # ─── Command registration ─────────────────────────────────────────────────

  Scenario: All vsdbg commands are visible in the Command Palette
    When I open the Command Palette (Cmd+Shift+P)
    Then I see the following commands prefixed with "DebuggingAI:":
      | command                              | pdb equivalent |
      | DebuggingAI: Start Debugging         | vsdbg --config |
      | DebuggingAI: Stop Debugging          | q              |
      | DebuggingAI: Continue                | c              |
      | DebuggingAI: Step Over               | n              |
      | DebuggingAI: Step Into               | s              |
      | DebuggingAI: Step Out                | r              |
      | DebuggingAI: Set Breakpoint Here     | b <lineno>     |
      | DebuggingAI: Clear All Breakpoints   | cl             |
      | DebuggingAI: List Breakpoints        | b (no args)    |
      | DebuggingAI: Inspect Variable        | p <expr>       |
      | DebuggingAI: Show Call Stack         | bt             |
      | DebuggingAI: Session Status          | status         |
      | DebuggingAI: List Launch Configs     | vsdbg --list   |
      | DebuggingAI: Run To Cursor           | unt <lineno>   |
      | DebuggingAI: Restart Debugging       | restart        |

  # ─── AI agent invocation ─────────────────────────────────────────────────

  Scenario: Claude Code starts a debug session by running a VS Code command
    When Claude Code issues:
      """
      Run command: DebuggingAI: Start Debugging
      """
    Then the extension calls vsdbg --config with the first launch.json configuration
    And the debug session starts
    And the Output Channel "DebuggingAI" logs the session start in JSON

  Scenario: Claude Code sets a breakpoint at a specific file and line
    When Claude Code issues:
      """
      Run command: DebuggingAI: Set Breakpoint
      {"file": "src/handlers.py", "line": 42}
      """
    Then the extension calls vsdbg's breakpoint API
    And the breakpoint is visible in the VS Code editor gutter
    And the Output Channel logs the breakpoint confirmation

  Scenario: Claude Code inspects a variable
    When Claude Code issues:
      """
      Run command: DebuggingAI: Inspect Variable
      {"expression": "user_id"}
      """
    Then the extension calls vsdbg_inspect
    And the Output Channel logs the result as JSON:
      """
      {"expression": "user_id", "value": 7, "type": "int"}
      """
    And Claude Code reads this from the Output Channel

  # ─── Output Channel ───────────────────────────────────────────────────────

  Scenario: Every command produces a structured JSON log in the Output Channel
    Given the Output Channel "DebuggingAI" is open
    When any DebuggingAI command is invoked (from Command Palette or an AI agent)
    Then a JSON log line is appended to the channel:
      """
      [2024-01-15T10:23:45Z] {"cmd":"continue","result":{"state":"paused","file":"app.py","line":55}}
      """
    And the channel auto-scrolls to the latest entry

  Scenario: AI agents can read session state from the Output Channel
    Given Claude Code needs to know if a debug session is active
    When Claude Code reads the DebuggingAI Output Channel
    Then it sees the latest status JSON and can determine the session state
    And it does not need to query vsdbg directly

  # ─── Configuration ────────────────────────────────────────────────────────

  Scenario: Configure the vsdbg binary path in VS Code settings
    When the user sets "debuggingAI.vsdbgPath" in settings.json
    Then the extension uses that binary instead of the PATH-resolved one

  Scenario: Configure MCP server port in VS Code settings
    When the user sets "debuggingAI.mcpPort" to 7891 in settings.json
    Then the embedded MCP server starts on port 7891 instead of 7890

  Scenario: Extension activates without launch.json present
    Given no .vscode/launch.json exists
    When VS Code opens the workspace
    Then the extension activates without error
    And commands that require launch.json show a helpful error if invoked:
      """
      No .vscode/launch.json found. Run "vsdbg app.py" to debug a file directly.
      """
