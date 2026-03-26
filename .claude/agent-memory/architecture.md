# DebuggingAI — Architecture Philosophy

## What this extension IS

A **debug adapter at the user level**. It lets an AI agent (Claude, Cline, Cursor, etc.) control VS Code's debugger the same way a human user would. The AI can set breakpoints, start/stop sessions, step through code, and inspect variables — without knowing anything about the underlying language or debugger.

## What this extension is NOT

- NOT a debugger
- NOT a language-specific adapter
- NOT a replacement for the Python/Go/Ruby/Node extension
- NOT something that talks DAP directly to debugpy, dlv, or any language runtime

## The Layer Model

```
AI Agent (Claude, Cline...)
        ↓
DebuggingAI Extension  ← YOU ARE HERE
        ↓
VS Code Debug API (vscode.debug.*)
        ↓
Language Extension (Python extension, Go , flutter, nodejs, rust, ruby , dart extension...)
        ↓
Language Debugger (debugpy, dlv, node , futter, inspector...)
```

We talk only to the VS Code Debug API layer. We are agnostic to what's below it.

## Key VS Code Debug API Concepts

- `vscode.debug.activeDebugSession.customRequest(cmd, args)` — send a DAP command through VS Code's proxy (step, continue, etc.)
- `vscode.debug.activeStackItem` — VS Code's currently selected call-stack frame (a `DebugStackFrame`). This is the SAME frame the Debug Console and Watch panel use. Read `.frameId` from it at call time.
- `vscode.debug.onDidChangeActiveStackItem` — fires AFTER VS Code processes a stop event and selects the top frame. Use this to know when the debugger is paused and get the authoritative frameId.
- `vscode.debug.registerDebugAdapterTrackerFactory` — intercept raw DAP messages (we use this to capture `stopped` event reason before `onDidChangeActiveStackItem` fires)

## The stoppedBus Pattern (extension.ts)

Because `onDidChangeActiveStackItem` doesn't carry the stop reason (breakpoint? step? entry?), we use a two-part approach:

1. `onDidSendMessage` (DAP tracker) captures the stop reason → `pendingStopReason`
2. `onDidChangeActiveStackItem` fires with VS Code's authoritative frameId → fires `stoppedBus` combining both

This gives us: file, line, function, reason, frameId — all from VS Code's own layer.

## Evaluate — The Right Approach

When evaluating an expression (print, whatis, exec, etc.):

```typescript
const activeItem = vscode.debug.activeStackItem;
const effectiveFrameId = (activeItem instanceof vscode.DebugStackFrame)
    ? activeItem.frameId   // VS Code's authoritative frame ID
    : cachedFrameId;       // fallback to last known frameId
session.customRequest('evaluate', { expression, context, frameId: effectiveFrameId })
```

**WHY `activeStackItem.frameId` and NOT a cached value:**
The Debug Console uses `vscode.debug.activeStackItem.frameId` internally. This is the frame ID VS Code knows how to route through its proxy layer to the correct language adapter. A cached frameId from a stop event may become stale or may not match VS Code's internal routing.

**NOTE:** As of the last session, the Python tests still fail with NameError. This is the UNSOLVED problem. See `python-frameid-investigation.md` for full details.

## Commands Architecture

All commands follow the pattern:
- `src/sessionCommands.ts` — thin command handlers, validate args, call SessionManager
- `src/session.ts` — SessionManager, pure state machine, no vscode imports
- `src/ISessionAdapter.ts` — interface that SessionManager depends on
- `src/extension.ts` — implements ISessionAdapter using real vscode.debug API, wires everything together

## Sprint Plan

- Sprint 1: Breakpoints ✅
- Sprint 2: Session lifecycle ✅
- Sprint 3: Execution control (step, next, continue, until, jump) ✅
- Sprint 4: Inspection (print, whatis, exec, display, args, retval) — 55/60 tests pass, 5 Python failing
- Sprint 5: Add flutter/dart language target (Mickey mentioned this explicitly)


