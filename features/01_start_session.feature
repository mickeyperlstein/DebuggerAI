Feature: Start a vsdbg debug session
  As an AI agent (bash, Claude, Cline, or any tool-capable agent)
  I want to start any debug session that is defined in .vscode/launch.json
  or that any installed VS Code debug adapter supports
  So that I can debug any language/runtime using a single familiar pdb-style interface

  Background:
    Given vsdbg is installed and available on PATH
    And a workspace is open with a .vscode/launch.json or a supported debug adapter installed

  # ─── From launch.json ──────────────────────────────────────────────────────

  Scenario: Start a named debug configuration from launch.json
    Given launch.json contains a configuration named "Debug Backend"
    When I run:
      """
      vsdbg --config "Debug Backend"
      """
    Then vsdbg reads that configuration and launches the appropriate debug adapter
    And execution pauses at the first breakable line (or at program entry)
    And the prompt shows:
      """
      > <file>(1)<module>()
      (vsdbg)
      """

  Scenario: Start the default (first) launch.json configuration
    Given launch.json has at least one configuration
    When I run:
      """
      vsdbg
      """
    Then vsdbg uses the first configuration in the list
    And reports which configuration was selected:
      """
      Starting: "Debug Backend" (node) — from .vscode/launch.json
      """

  Scenario: List all available launch.json configurations
    When I run:
      """
      vsdbg --list
      """
    Then the output lists every configuration with its index, name, type, and request:
      """
      [0] "Debug Backend"   type=node     request=launch
      [1] "Debug Frontend"  type=chrome   request=launch
      [2] "Attach to Flask" type=python   request=attach
      [3] "Debug Flutter"   type=dart     request=launch
      [4] "Debug Go API"    type=go       request=launch
      """
    And the exit code is 0

  Scenario: Start by index when names are ambiguous or hard to type
    When I run:
      """
      vsdbg --config 2
      """
    Then vsdbg starts the configuration at index 2 ("Attach to Flask")

  # ─── Language-specific examples (any adapter installed in VS Code) ─────────

  Scenario: Start a Node.js debug session
    Given launch.json has a config: type=node, request=launch, program="src/index.js"
    When I run:
      """
      vsdbg --config "Debug Backend"
      """
    Then vsdbg launches the Node.js debug adapter
    And Node.js starts with --inspect flags
    And the pdb-style interface is available at the (vsdbg) prompt

  Scenario: Start a Python/Flask debug session
    Given launch.json has a config: type=python, request=launch, module="flask"
    When I run:
      """
      vsdbg --config "Debug Flask"
      """
    Then vsdbg launches debugpy as the debug adapter
    And Flask starts under the debugger
    And the (vsdbg) prompt is available

  Scenario: Start a Go debug session (using delve adapter)
    Given the "go" VS Code debug adapter is installed (dlv/vscode-go)
    And launch.json has a config: type=go, request=launch, program="./cmd/server"
    When I run:
      """
      vsdbg --config "Debug Go API"
      """
    Then vsdbg launches dlv (Delve) as the debug adapter
    And the (vsdbg) prompt is available

  Scenario: Start a Flutter/Dart debug session
    Given the Dart VS Code debug adapter is installed
    And launch.json has a config: type=dart, request=launch
    When I run:
      """
      vsdbg --config "Debug Flutter"
      """
    Then vsdbg launches the Dart debug adapter
    And the (vsdbg) prompt is available

  Scenario: Start a Chrome/browser debug session
    Given the Debugger for Chrome or built-in JS debugger adapter is installed
    And launch.json has a config: type=chrome, request=launch, url="http://localhost:3000"
    When I run:
      """
      vsdbg --config "Debug Frontend"
      """
    Then vsdbg launches Chrome in debug mode and attaches
    And the (vsdbg) prompt is available

  # ─── Quick-launch a Python file directly (pdb-style shortcut) ──────────────

  Scenario: Quick-launch a Python file without a launch.json entry
    When I run:
      """
      vsdbg app.py
      """
    Then vsdbg infers type=python and synthesizes a minimal launch config
    And debugpy is used as the debug adapter
    And execution pauses at line 1 of app.py

  # ─── Error cases ───────────────────────────────────────────────────────────

  Scenario: Fail when named config does not exist in launch.json
    When I run:
      """
      vsdbg --config "Nonexistent Config"
      """
    Then vsdbg exits with a non-zero status code
    And stderr contains:
      """
      error: no configuration named "Nonexistent Config" in .vscode/launch.json
      Available: Debug Backend, Debug Frontend, Attach to Flask
      """

  Scenario: Fail when no launch.json exists and no file argument given
    Given no .vscode/launch.json exists in the workspace
    When I run:
      """
      vsdbg
      """
    Then vsdbg exits with a non-zero status code
    And stderr contains:
      """
      error: no .vscode/launch.json found and no target file specified
      Tip: run "vsdbg app.py" to debug a Python file directly,
           or create .vscode/launch.json first
      """

  Scenario: Fail when a required debug adapter is not installed
    Given the "dart" adapter is not installed in VS Code
    And launch.json references a dart configuration
    When I run:
      """
      vsdbg --config "Debug Flutter"
      """
    Then vsdbg exits with a non-zero status code
    And stderr contains:
      """
      error: debug adapter "dart" is not installed
      Install the Dart VS Code extension to use this configuration
      """
