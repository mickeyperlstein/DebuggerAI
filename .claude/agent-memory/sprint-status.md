# Sprint Status

## Current State (as of 2026-03-25)

**Test results: 55 passing / 5 failing**
- All in python:

The 5 failing tests are all in `Sprint 4 — Inspection (Python)`:
- `print: returns valueRepr for a local variable`
- `print: evaluates an arithmetic expression`
- `prettyPrint: returns valueRepr (same adapter path as print)`
- `whatis: returns type information for a variable`
- `display: registers expression and returns valueRepr containing it`

All fail with the same error: `NameError: name 'a' is not defined` — Python's debugpy evaluates at module scope instead of inside `add(a, b)`.

## Sprint 1 — Breakpoints ✅ COMPLETE

Files: `src/breakpoints.ts`, `src/commands.ts`, `src/IDebugAdapter.ts`
Tests: `src/__tests__/breakpoints.test.ts`, `src/__tests__/commands.test.ts`
Commands: setBreakpoint, editBreakpoint, listBreakpoints, clearBreakpoint, clearAllBreakpoints

## Sprint 2 — Session Lifecycle ✅ COMPLETE

Files: `src/session.ts`, `src/ISessionAdapter.ts`, `src/sessionCommands.ts`
Tests: integration tests in `src/test/suite/sprint2.test.ts`
Commands: start, quit, restart, status

## Sprint 3 — Execution Control ✅ COMPLETE

Tests: integration tests in `src/test/suite/sprint3.test.ts`
Commands: continue, next, step, return, until, jump
All 3 language targets (Node.js, TypeScript, Python) pass.

## Sprint 4 — Inspection 🔴 IN PROGRESS

Tests: integration tests in `src/test/suite/sprint4.test.ts`
Commands: print, prettyPrint, whatis, exec, display, undisplay, args, retval
Node.js: ✅ all pass
TypeScript: ✅ all pass
Python: ❌ 5 tests failing (see python-frameid-investigation.md)

## Sprint 5 (N+1) — Refactor extension.ts + Fix Python 🔲 NOT STARTED

Per `REARCHITECTURE_PROMPT.md` in project root:
1. Fix Python frameId via `PythonStrategy` (isolates the quirk, doesn't pollute global code)
2. Extract from `extension.ts`:
   - `src/adapters/VsCodeBreakpointAdapter.ts` (IDebugAdapter impl)
   - `src/adapters/VsCodeDapProxy.ts` (stoppedBus + DAP tracker)
   - `src/adapters/VsCodeSessionAdapter.ts` (ISessionAdapter impl)
   - `src/commands/VsCodeCommandRegistry.ts` (registerCommand calls)
3. `extension.ts` becomes thin composition root (~20 lines)

## Sprint 6 (N+2) — DAP Client + Language Strategies 🔲 NOT STARTED

- `src/dap/DapClient.ts` — standalone stdio/TCP DAP communication
- `src/strategies/PythonStrategy.ts`, `NodeStrategy.ts`, `GoStrategy.ts`
- `src/adapters/TerminalSessionAdapter.ts` — ISessionAdapter using DapClient (no vscode)
- Go language target added to integration test matrix

## Sprint 7 (N+3) — Terminal/MCP Path 🔲 NOT STARTED

- CLI entry point using SessionManager + DapClient
- MCP server exposing SessionManager operations as MCP tools
- E2E tests for terminal and MCP paths (no VS Code required)

## Test Infrastructure

- Unit tests (Jest): `npm test` — runs `src/__tests__/**/*.test.ts` with vscode mocked
- Integration tests: `npm run test:integration` — runs inside real VS Code via @vscode/test-electron
- Test suite entry: `src/test/suite/index.ts`
- Test apps: `test_app.js`, `test_app.ts`, `test_app.py` — all expose `add(a, b)` with locals `a`, `b`, `result` at line 14
