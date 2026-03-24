# DebuggingAI

> Universal debugger control for any AI agent.

DebuggingAI is a VS Code extension that exposes debugger control as a tool interface — so any AI agent (Claude Code, Cline, Cursor, Copilot Workspace, local LLMs) can set breakpoints, inspect state, and drive a debug session without knowing VS Code internals.

## Positioning

Most AI coding agents can read and write files. None can control the debugger.
DebuggingAI bridges that gap — agent-agnostic, runtime-agnostic, built on VS Code's native debug API and the Debug Adapter Protocol.

```
Agent (Claude / Cline / any)
        ↓
  DebuggingAI extension   ←  also accepts manual gutter clicks
        ↓  DAP
  debugpy / node / delve / dart …
        ↓
  Your running program
```

## Current feature set — Sprint 1

**Breakpoint management** — the full pdb `b` / `cl` / `enable` / `disable` surface:

| Command | What it does |
|---|---|
| `DebuggingAI: Set Breakpoint` | Set a breakpoint at the cursor line, optional condition |
| `DebuggingAI: Edit Breakpoint` | Change condition, line, or enabled state by ID |
| `DebuggingAI: List Breakpoints` | Print all breakpoints as a JSON table to the Output channel |
| `DebuggingAI: Clear Breakpoint` | Remove one breakpoint by ID |
| `DebuggingAI: Clear All Breakpoints` | Remove every breakpoint in the session |

All commands are also callable over a local HTTP server on port 7890 — any bash-based agent can drive them with `curl`.

Breakpoints set manually in the editor gutter are automatically synced into the extension's store so `List` always shows the full picture.

Every action is logged as structured JSON to the **DebuggingAI** Output channel.

## Roadmap

| Sprint | Feature |
|---|---|
| ✅ 1 | Breakpoint management |
| ✅ 2 | Session lifecycle — start, stop, restart any `launch.json` config |
| ✅ 3 | Execution control — continue, next, step, return, until, jump |
| 4 | Inspection — print, pp, whatis, display, args, retval |
| 5 | Stack navigation — backtrace, up, down |
| 6 | Source listing — list, longlist |

## Works with

Claude Code · Cline · Cursor · GitHub Copilot Workspace · any MCP-capable agent · any agent that can call VS Code commands or make HTTP requests.

## Development

```bash
npm install
npm run compile   # TypeScript → out/
npm test          # Jest unit tests (no VS Code required)
npm run test:e2e  # vscode-extension-tester end-to-end tests
```

Press `F5` in VS Code to launch the Extension Development Host.
