# DebuggingAI Agent Memory

This directory contains state and context for AI agents working on the DebuggingAI project.
**Start here when resuming work: read ALL files in this directory before doing anything.**

## Files

- [architecture.md](architecture.md) — Core design philosophy (READ THIS FIRST)
- [sprint-status.md](sprint-status.md) — What's done, what's in progress, what's next
- [python-frameid-investigation.md](python-frameid-investigation.md) — Detailed investigation of the 5 failing Python tests and everything tried
- [owner-preferences.md](owner-preferences.md) — How Mickey wants the code and collaboration to work

## ALSO READ: REARCHITECTURE_PROMPT.md (in project root)

`/REARCHITECTURE_PROMPT.md` is the **master plan** for where this project is going. Read it fully before resuming work. It describes:

- Why `extension.ts` violates SRP and must be refactored
- The target file structure (`src/adapters/`, `src/strategies/`, `src/dap/`, `src/commands/`)
- The Strategy Pattern approach that solves the Python frameId problem cleanly
- `LanguageStrategy` interface + `PythonStrategy`, `NodeStrategy`, `GoStrategy` implementations
- The future terminal/MCP path (debugging without VS Code)
- Sprint-level implementation order (Sprint N+1: extract classes, Sprint N+2: DAP client + strategies, Sprint N+3: terminal/MCP)

**The immediate next task** is Sprint N+1 from that document:
1. Fix the 5 Python tests (frameId) — possibly via `PythonStrategy`
2. Extract `VsCodeBreakpointAdapter`, `VsCodeDapProxy`, `VsCodeSessionAdapter`, `VsCodeCommandRegistry` from `extension.ts`
3. Make `extension.ts` a thin composition root (~20 lines)
