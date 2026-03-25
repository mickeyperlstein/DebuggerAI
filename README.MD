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

## Feature set

**All commands are callable over HTTP on port 7890** — any agent can drive them with `curl`, no VS Code knowledge required.

### Breakpoints
| Command | HTTP | What it does |
|---|---|---|
| `DebuggingAI: Set Breakpoint` | `POST /breakpoints` | Set breakpoint at file:line, optional condition |
| `DebuggingAI: Edit Breakpoint` | `PATCH /breakpoints/:id` | Change condition or enabled state |
| `DebuggingAI: List Breakpoints` | `GET /breakpoints` | List all breakpoints as JSON |
| `DebuggingAI: Clear Breakpoint` | `DELETE /breakpoints/:id` | Remove one breakpoint |
| `DebuggingAI: Clear All Breakpoints` | `DELETE /breakpoints` | Remove all breakpoints |

### Session lifecycle
| Command | HTTP | What it does |
|---|---|---|
| `DebuggingAI: Start Debug Session` | `POST /session/start` | Launch a `launch.json` config by name |
| `DebuggingAI: Stop Debug Session` | `POST /session/stop` | Stop the active session |
| `DebuggingAI: Restart Debug Session` | `POST /session/restart` | Restart the active session |
| `DebuggingAI: Session Status` | `GET /session/status` | Active session info |

### Execution control
| Command | HTTP | What it does |
|---|---|---|
| `DebuggingAI: Continue` | `POST /execution/continue` | Resume until next breakpoint |
| `DebuggingAI: Next` | `POST /execution/next` | Step over |
| `DebuggingAI: Step` | `POST /execution/step` | Step into |
| `DebuggingAI: Return` | `POST /execution/return` | Step out |
| `DebuggingAI: Until Line` | `POST /execution/until` | Run until line |
| `DebuggingAI: Jump to Line` | `POST /execution/jump` | Jump to line |

### Inspection
| Command | HTTP | What it does |
|---|---|---|
| `DebuggingAI: Print Expression` | `POST /inspect/print` | Evaluate and print |
| `DebuggingAI: Pretty-Print Expression` | `POST /inspect/pp` | Pretty-print |
| `DebuggingAI: What Is` | `POST /inspect/whatis` | Type of expression |
| `DebuggingAI: Display Expression` | `POST /inspect/display` | Watch an expression |
| `DebuggingAI: Undisplay Expression` | `DELETE /inspect/display` | Remove watch |
| `DebuggingAI: Show Function Arguments` | `POST /inspect/args` | Current frame args |
| `DebuggingAI: Show Return Value` | `POST /inspect/retval` | Last return value |

## Roadmap

| Sprint | Feature |
|---|---|
| ✅ 1 | Breakpoint management |
| ✅ 2 | Session lifecycle |
| ✅ 3 | Execution control |
| ✅ 4 | Inspection — print, pp, whatis, display, args, retval |
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
