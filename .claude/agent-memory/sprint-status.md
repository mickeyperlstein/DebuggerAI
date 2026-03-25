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

## Sprint 5 — Go Language Target 🔲 NOT STARTED

Mickey wants Go added to the integration test matrix alongside Node.js, TypeScript, Python.
Will need: `test_app.go`, Go launch config in `.vscode/launch.json`, `makeInspectionSuite` target in sprint4.test.ts.

## Test Infrastructure

- Unit tests (Jest): `npm test` — runs `src/__tests__/**/*.test.ts` with vscode mocked
- Integration tests: `npm run test:integration` — runs inside real VS Code via @vscode/test-electron
- Test suite entry: `src/test/suite/index.ts`
- Test apps: `test_app.js`, `test_app.ts`, `test_app.py` — all expose `add(a, b)` with locals `a`, `b`, `result` at line 14
