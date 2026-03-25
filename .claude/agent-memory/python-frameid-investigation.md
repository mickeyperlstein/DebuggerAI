# Python FrameId Investigation

## The Problem

5 Sprint 4 tests fail for Python only. Node.js and TypeScript pass identically.

Error: `NameError: name 'a' is not defined`
Python traceback: `File "<string>", line 1, in <module>` — this means debugpy evaluated at **module scope**, not inside `add(a, b)`.

The test sets a breakpoint at line 14 (inside `add(a, b)`), starts the session, continues to the breakpoint, then calls `print('a')`. At line 14, `a` is a local variable. The Debug Console in VS Code shows it correctly (`a=0`, `b=10`, `a+b=10` — confirmed by Mickey).

## Root Cause Hypothesis

`session.customRequest('evaluate', { expression, frameId, context })` goes through VS Code's DAP proxy. The proxy sends the `frameId` value **as-is** to the underlying adapter. For Python/debugpy, it needs the raw Python frame ID (which debugpy stores as `id(frame)` — a Python memory address like `4302698784`). If the wrong frameId is sent, debugpy can't find the frame and evaluates at module scope.

## What We Know About FrameIds

- **debugpy**: Uses `id(frame)` as frame IDs (Python memory addresses, large integers like `4302698784`)
- **pwa-node**: Uses its own sequential IDs
- **VS Code internally**: Maps adapter frame IDs to VS Code-internal sequential IDs for UI purposes
- **`vscode.debug.activeStackItem.frameId`**: This SHOULD be the raw adapter frame ID (VS Code stores the adapter's original ID in its frame model). For pwa-node this works. For debugpy — unclear.

## Everything That Was Tried (DO NOT REPEAT THESE)

1. **Omit frameId for Python** — debugpy uses global scope → NameError (same)
2. **`context: 'watch'`** — still wrong frameId, still NameError
3. **Remove `justMyCode: false`** — no effect
4. **Fresh `customRequest('stackTrace')` at evaluate time** — returns VS Code-remapped IDs that don't roundtrip to debugpy
5. **`vscode.debug.activeStackItem.frameId` cached at stop time** — broke Node.js (15 failing, "Stack frame not found")
6. **`onDidChangeActiveStackItem` approach** (current code) — fixes Node.js, Python still NameError
7. **`vscode.debug.activeStackItem` at call time** (latest attempt, NOT yet confirmed working or failing — diagnostic logging was added but test interrupted)

## Current Code State (extension.ts evaluate)

```typescript
async evaluate(expression: string, frameId: number, context = 'repl') {
  const session = vscode.debug.activeDebugSession;
  if (!session) return { error: 'no active debug session' };

  // Use VS Code's currently selected frame at call time
  const activeItem = vscode.debug.activeStackItem;
  const effectiveFrameId = (activeItem instanceof vscode.DebugStackFrame)
    ? activeItem.frameId
    : frameId;

  // DIAGNOSTIC LOGGING (remove once fixed):
  console.error(`[DIAG] eval type=${session.type} activeItem=${activeItem?.constructor?.name} activeFrameId=${(activeItem as any)?.frameId} cached=${frameId} effective=${effectiveFrameId} expr=${expression}`);

  try {
    const r = await Promise.resolve(session.customRequest('evaluate', { expression, context, frameId: effectiveFrameId }));
    console.error(`[DIAG] ok result=${r?.result}`);
    return { result: r?.result ?? '', type: r?.type };
  } catch (e: any) {
    return { error: e?.message ?? 'evaluation failed' };
  }
},
```

The [DIAG] logs from the last test run showed NO Python entries — only `type=pwa-node`. This means either:
- `vscode.debug.activeStackItem` is null/undefined for Python (so falls back to cached frameId), AND
- The Python evaluate somehow still gets called but at module scope

## Next Steps to Try

### Option A: Read [DIAG] output for Python
Run `npm run test:integration 2>&1 | grep -E "\[DIAG\]"` and look for `type=debugpy` or `type=python` entries to see what frameId is being sent.

### Option B: Use stackTrace with active thread
At evaluate time, fetch a fresh stackTrace using the active thread ID from `vscode.debug.activeStackItem?.threadId`:
```typescript
const activeItem = vscode.debug.activeStackItem;
if (activeItem instanceof vscode.DebugStackFrame) {
    const st = await session.customRequest('stackTrace', {
        threadId: activeItem.threadId,
        startFrame: 0, levels: 1
    });
    effectiveFrameId = st?.stackFrames?.[0]?.id ?? frameId;
}
```
This gets the frame ID directly from the adapter's own stackTrace response at evaluation time.

### Option C: Variables panel approach (bypass evaluate entirely)
Instead of `evaluate`, use `scopes` + `variables` to walk the variable tree and find the expression:
```typescript
const scopes = await session.customRequest('scopes', { frameId });
for (const scope of scopes.scopes) {
    const vars = await session.customRequest('variables', { variablesReference: scope.variablesReference });
    const match = vars.variables.find(v => v.name === expression);
    if (match) return { result: match.value, type: match.type };
}
```
This avoids the frameId-for-evaluate issue entirely. BUT: it only works for simple variable names, not expressions like `a + b`.

### Option D: Check if debugpy needs `context: 'clipboard'` or other context
Some debug adapters treat `context` differently. Try sending without `context` or with `context: 'clipboard'`.

### The Key Question to Resolve
Does `session.customRequest('evaluate', { frameId: X })` translate `X` through VS Code's internal frame model before forwarding to the adapter? If YES, then we need VS Code's internal frame ID. If NO, we need the raw adapter frame ID.
- For pwa-node: both seem to be the same (or pwa-node is tolerant)
- For debugpy: they appear to be different

## Diagnostic To Run First
```bash
npm run test:integration 2>&1 | grep "\[DIAG\]"
```
Look for `type=debugpy` or `type=python` entries. Note the `cached=` and `effective=` values. Compare to Node.js values (which are like 11, 33, 55...).
