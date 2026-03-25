# DebuggerAI Rearchitecture — Claude Code Prompt

## Context

You are refactoring DebuggerAI from a VS Code-dependent extension into an IDE-agnostic, DAP-centric debugging platform. The goal is to enable any AI agent to debug any DAP-compatible language (Python, Node, Go, Dart, etc.) via either:
- **Path A:** VS Code extension (human + AI)
- **Path B:** Terminal/MCP server (AI only)

Both paths share the same core: DAP client, normalized model, language strategies, session manager.

---

## Current State Analysis

### What's Already SOLID-Compliant

These files have **zero vscode imports** and follow Dependency Inversion:

| File | Interface Depends On | Status |
|---|---|---|
| `src/session.ts` | `ISessionAdapter` | ✅ Clean |
| `src/breakpoints.ts` | `IDebugAdapter` | ✅ Clean |
| `src/server.ts` | `SessionManager`, `BreakpointManager` | ✅ Clean |
| `bin/vsdbg` | HTTP to server | ✅ Clean |

### The Problem: `extension.ts` Violates SRP

The file implements 6 responsibilities in one class:
1. `IDebugAdapter` implementation (breakpoint adapter) — 6 lines
2. `ISessionAdapter` implementation (session adapter) — ~80 lines of VS Code APIs
3. DAP proxy + stoppedBus pattern — ~50 lines
4. Server wiring — 5 lines
5. Command registration — 30 lines
6. Breakpoint sync listener — 20 lines

### SOLID Violations

| Principle | Status | Issue |
|---|---|---|
| **S** - Single Responsibility | ❌ | `extension.ts` does 6 things |
| **O** - Open/Closed | ❌ | Adding a new language requires modifying `extension.ts` |
| **L** - Liskov Substitution | ✅ | Interfaces are clean |
| **I** - Interface Segregation | ✅ | Interfaces are focused |
| **D** - Dependency Inversion | ✅ | Managers depend on abstractions |

### The Python FrameId Problem

Python's debugpy returns frame IDs that don't match VS Code's internal routing. When you call `session.customRequest('stackTrace', ...)`, debugpy returns frame IDs that work for subsequent DAP requests. But when you use those cached IDs with `evaluate`, debugpy evaluates at the wrong scope (module scope instead of function scope).

**Current hack in `extension.ts` evaluate method:**
```typescript
const activeItem = vscode.debug.activeStackItem;
const effectiveFrameId = (activeItem instanceof vscode.DebugStackFrame)
  ? activeItem.frameId    // Use VS Code's authoritative frame ID
  : frameId;              // Fallback to cached
```

This reads VS Code's own frame selection at call time. But it still fails for Python because VS Code's internal frame routing may differ from what debugpy expects.

**5 tests failing** in Python inspection (Sprint 4).

---

## Target Architecture

### File Structure After Refactoring

```
src/
├── adapters/
│   ├── IDebugAdapter.ts              ← existing, no change
│   ├── ISessionAdapter.ts            ← existing, no change
│   ├── VsCodeBreakpointAdapter.ts    ← IDebugAdapter impl (6 lines)
│   ├── VsCodeSessionAdapter.ts       ← ISessionAdapter impl (~80 lines)
│   └── VsCodeDapProxy.ts             ← stoppedBus + DAP tracker (~50 lines)
├── dap/
│   └── DapClient.ts                  ← stdio/TCP DAP communication (NEW)
├── strategies/
│   ├── LanguageStrategy.ts           ← interface (NEW)
│   ├── PythonStrategy.ts             ← frameId quirks (NEW)
│   ├── NodeStrategy.ts               ← (NEW)
│   └── GoStrategy.ts                 ← (NEW)
├── models/
│   └── NormalizedTypes.ts            ← NormalizedThread, Frame, Variable (NEW)
├── commands/
│   └── VsCodeCommandRegistry.ts      ← registerCommand calls (~30 lines)
├── session.ts                        ← existing, no change
├── breakpoints.ts                    ← existing, no change
├── server.ts                         ← existing, no change
├── types.ts                          ← existing, no change
├── log.ts                            ← existing, no change
└── extension.ts                      ← becomes thin composition root (~20 lines)
```

### What `extension.ts` Becomes

```typescript
export async function activate(ctx: vscode.ExtensionContext) {
  // Compose adapters
  const bpAdapter = new VsCodeBreakpointAdapter();
  const dapProxy = new VsCodeDapProxy(ctx);
  const sessionAdapter = new VsCodeSessionAdapter(dapProxy);
  
  // Compose managers (already clean)
  const bpManager = new BreakpointManager(bpAdapter);
  const sessionManager = new SessionManager(sessionAdapter);
  
  // Wire server (already clean)
  const port = vscode.workspace.getConfiguration('debuggingAI').get<number>('serverPort', 7890);
  const server = new Server(bpManager, sessionManager, port);
  await server.start();
  
  // Register commands
  new VsCodeCommandRegistry(ctx, bpManager, sessionManager);
  
  log({ event: 'activated', name: 'debugai', port, version: '0.1.0' });
}
```

---

## Strategy Pattern Deep Dive

### Why Strategy Pattern Matters Here

Each debug adapter (debugpy, node-debug2, delve) has quirks:
- **debugpy (Python):** Frame IDs don't match VS Code's internal routing. `evaluate` needs special frameId handling.
- **node-debug2 (Node):** Works correctly with cached frame IDs. No special handling needed.
- **delve (Go):** Goroutines have different thread semantics than OS threads.

Without strategy pattern, these quirks leak into `extension.ts` and the AI core. With strategy pattern, each language handles its own quirks in isolation.

### LanguageStrategy Interface

```typescript
export interface LanguageStrategy {
  getLanguageName(): string;
  
  // Adapter lifecycle
  launchAdapter(launchConfig: LaunchConfig): Promise<AdapterConnection>;
  
  // Normalization — raw DAP → clean model
  normalizeThread(rawThread: any): NormalizedThread;
  normalizeFrame(rawFrame: any): NormalizedFrame;
  normalizeVariable(rawVar: any): NormalizedVariable;
  normalizeException(rawEvent: any): NormalizedException | null;
  
  // Language-specific helpers
  getEntryFileFromConfig(launchConfig: LaunchConfig): string | null;
  
  // Frame ID normalization (the Python quirk)
  normalizeFrameId(rawFrameId: number, context: FrameContext): number;
}
```

### PythonStrategy Implementation Insight

```typescript
export class PythonStrategy implements LanguageStrategy {
  getLanguageName(): string { return 'python'; }
  
  normalizeFrameId(rawFrameId: number, context: FrameContext): number {
    // Python's debugpy returns frame IDs that work for subsequent DAP requests
    // but NOT for evaluate when called from VS Code's proxy layer.
    // 
    // The fix: use VS Code's activeStackItem.frameId when available,
    // because that's the frame ID VS Code's Debug Console uses.
    // 
    // In terminal/MCP mode (no VS Code), we can use the raw DAP frame ID
    // directly because we talk to debugpy without VS Code's proxy.
    
    if (context.hasVsCodeProxy) {
      // Path A: VS Code extension — use VS Code's frame ID
      return context.vsCodeFrameId ?? rawFrameId;
    } else {
      // Path B: Terminal/MCP — use raw DAP frame ID directly
      return rawFrameId;
    }
  }
  
  normalizeFrame(rawFrame: any): NormalizedFrame {
    // Python-specific: debugpy uses different field names for async frames
    return {
      id: String(rawFrame.id),
      threadId: String(rawFrame.threadId ?? 1),
      functionName: rawFrame.name,
      file: rawFrame.source?.path ?? '',
      line: rawFrame.line,
      isAsync: rawFrame.presentationHint === 'subtle' || rawFrame.name?.startsWith('async')
    };
  }
}
```

### NodeStrategy Implementation Insight

```typescript
export class NodeStrategy implements LanguageStrategy {
  getLanguageName(): string { return 'node'; }
  
  normalizeFrameId(rawFrameId: number, _context: FrameContext): number {
    // Node.js debug adapter works correctly with cached frame IDs.
    // No special handling needed.
    return rawFrameId;
  }
  
  normalizeFrame(rawFrame: any): NormalizedFrame {
    // Node.js: straightforward mapping
    return {
      id: String(rawFrame.id),
      threadId: String(rawFrame.threadId ?? 1),
      functionName: rawFrame.name,
      file: rawFrame.source?.path ?? '',
      line: rawFrame.line,
      isAsync: rawFrame.name?.includes('async') ?? false
    };
  }
}
```

### Key Insight: The Strategy Pattern Solves the FrameId Problem

Instead of one hack in `extension.ts` that tries to handle all languages, each strategy handles its own quirks. This means:
- Python's frameId issue is isolated to `PythonStrategy.normalizeFrameId()`
- Node's strategy is trivial (pass-through)
- Future languages (Go, Dart) add their own strategies without touching existing code
- Testing each strategy is independent — mock `DapClient`, test normalization

---

## Code Review Tips for SOLID Architecture

### 1. Single Responsibility Principle (SRP)

**Rule:** Each class should have one reason to change.

**Red flags in current code:**
- `extension.ts` has 6 different reasons to change (breakpoint logic, session logic, DAP proxy, server wiring, command registration, breakpoint sync)
- If you need to modify how DAP messages are intercepted, you have to read through breakpoint code, session code, and command registration code

**How to fix:**
- Extract each responsibility into its own class
- Each class implements one interface
- `extension.ts` becomes a composition root that wires them together

**Test:** If you can describe a class with "and" (e.g., "handles breakpoints AND sessions AND DAP proxy AND..."), it violates SRP.

### 2. Open/Closed Principle (OCP)

**Rule:** Classes should be open for extension, closed for modification.

**Red flags in current code:**
- Adding Go support requires modifying `extension.ts` to handle Go-specific quirks
- The `evaluate` method has a Python-specific hack that affects all languages

**How to fix:**
- Use Strategy Pattern: add `GoStrategy` without modifying existing code
- Use polymorphism instead of conditionals

**Test:** Can you add a new language by only adding new files (no modifications to existing files)?

### 3. Dependency Inversion Principle (DIP)

**Rule:** High-level modules should not depend on low-level modules. Both should depend on abstractions.

**Already done well:**
- `SessionManager` depends on `ISessionAdapter` (abstraction)
- `BreakpointManager` depends on `IDebugAdapter` (abstraction)

**How to maintain:**
- Never import `vscode` in `session.ts`, `breakpoints.ts`, or `server.ts`
- New modules (DapClient, strategies) should also avoid vscode imports
- Only `adapters/VsCode*.ts` files should import vscode

**Test:** Run `grep -r "import.*vscode" src/ | grep -v adapters/ | grep -v __mocks__` — should return nothing.

---

## Testing Strategy

### Unit Tests (No VS Code Required)

**Current state:** Jest tests in `src/__tests__/` with mocked vscode.

**New architecture enables:**
```typescript
// Test SessionManager without VS Code
describe('SessionManager', () => {
  it('should start session', async () => {
    const mockAdapter: ISessionAdapter = {
      startDebugging: jest.fn().mockResolvedValue({ file: 'app.py', line: 1, reason: 'entry' }),
      stopDebugging: jest.fn(),
      // ... other methods
    };
    const manager = new SessionManager(mockAdapter);
    const result = await manager.start('Debug test_app.py');
    expect(result.ok).toBe(true);
    expect(result.state).toBe('paused');
  });
});

// Test PythonStrategy independently
describe('PythonStrategy', () => {
  it('should normalize frame ID for VS Code context', () => {
    const strategy = new PythonStrategy();
    const normalized = strategy.normalizeFrameId(123, { 
      hasVsCodeProxy: true, 
      vsCodeFrameId: 456 
    });
    expect(normalized).toBe(456); // Uses VS Code's frame ID
  });
  
  it('should use raw frame ID for terminal context', () => {
    const strategy = new PythonStrategy();
    const normalized = strategy.normalizeFrameId(123, { 
      hasVsCodeProxy: false 
    });
    expect(normalized).toBe(123); // Uses raw DAP frame ID
  });
});
```

**Key insight:** With strategy pattern, you can test language-specific logic without running VS Code. Mock `DapClient`, test normalization.

### Integration Tests (Requires VS Code)

**Current state:** `src/test/suite/sprint*.test.ts` run inside VS Code extension host.

**New architecture enables two types:**

#### Type 1: VS Code Integration Tests (existing pattern)
```typescript
// src/test/suite/sprint5.test.ts
test('backtrace: returns stack frames', async function () {
  await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 27 });
  await cmd('debuggingAI.start', { config: 'Debug test_app.py' });
  await cmd('debuggingAI.continue');
  
  const r = await cmd('debuggingAI.backtrace');
  assert.strictEqual(r.ok, true);
  assert.ok(r.frames.length > 0);
  assert.strictEqual(r.frames[0].function, 'process');
});
```

#### Type 2: DAP Client Integration Tests (NEW — no VS Code)
```typescript
// src/dap/__tests__/DapClient.test.ts
describe('DapClient', () => {
  it('should connect to debugpy via stdio', async () => {
    const client = new DapClient();
    await client.connect({ 
      command: 'python', 
      args: ['-m', 'debugpy', '--listen', '5678', 'test_app.py'] 
    });
    
    await client.send('initialize', { clientID: 'test' });
    await client.send('launch', { program: 'test_app.py' });
    
    const stopped = await client.waitForEvent('stopped');
    expect(stopped.reason).toBe('entry');
    
    const stack = await client.send('stackTrace', { threadId: 1 });
    expect(stack.stackFrames.length).toBeGreaterThan(0);
    
    await client.disconnect();
  });
});
```

**Key insight:** DAP client tests run outside VS Code. They test the actual DAP protocol with real debug adapters. This is the foundation for terminal/MCP path.

### E2E Tests (Full Stack)

**Current state:** `src/e2e/sprint1.e2e.ts` tests the full VS Code extension.

**New architecture enables:**
```typescript
// src/e2e/terminal.e2e.ts — NEW: test terminal/MCP path
describe('Terminal DebuggerAI', () => {
  it('should debug Python app via DAP client', async () => {
    const strategy = new PythonStrategy();
    const connection = await strategy.launchAdapter({ 
      program: 'test_app.py',
      stopOnEntry: true 
    });
    
    const dapClient = new DapClient();
    await dapClient.connect(connection);
    
    const sessionManager = new SessionManager(new TerminalSessionAdapter(dapClient));
    const result = await sessionManager.start('Debug test_app.py');
    
    expect(result.ok).toBe(true);
    expect(result.state).toBe('paused');
    
    const inspect = await sessionManager.print('a');
    expect(inspect.ok).toBe(true);
    
    await sessionManager.quit();
    await dapClient.disconnect();
  });
});
```

**Key insight:** E2E tests for terminal path don't need VS Code at all. They test the full stack: strategy → DapClient → real debug adapter → normalized model.

---

## Implementation Order (Sprint-Level)

### Sprint N+1: Foundations (This Sprint)

**Goal:** Extract classes from `extension.ts`, create strategy pattern foundation.

1. **Create `src/models/NormalizedTypes.ts`**
   - Define `NormalizedThread`, `NormalizedFrame`, `NormalizedVariable`, `NormalizedException`
   - No logic, just types

2. **Create `src/strategies/LanguageStrategy.ts`**
   - Define the interface
   - No implementations yet

3. **Extract `src/adapters/VsCodeBreakpointAdapter.ts`**
   - Move `IDebugAdapter` implementation from `extension.ts` (6 lines)
   - No logic change

4. **Extract `src/adapters/VsCodeDapProxy.ts`**
   - Move stoppedBus pattern from `extension.ts` (~50 lines)
   - Move DAP tracker factory from `extension.ts`
   - Move `waitForStop()` function from `extension.ts`
   - Expose clean interface: `onStop`, `waitForStop()`

5. **Extract `src/adapters/VsCodeSessionAdapter.ts`**
   - Move `ISessionAdapter` implementation from `extension.ts` (~80 lines)
   - Depends on `VsCodeDapProxy` for DAP communication
   - Depends on `vscode.debug.*` APIs

6. **Extract `src/commands/VsCodeCommandRegistry.ts`**
   - Move command registration from `extension.ts` (~30 lines)
   - Depends on `SessionManager`, `BreakpointManager`

7. **Refactor `src/extension.ts`**
   - Becomes thin composition root (~20 lines)
   - Wires adapters, managers, server, commands

8. **Write tests**
   - Unit tests for `SessionManager` with mock `ISessionAdapter`
   - Unit tests for `BreakpointManager` with mock `IDebugAdapter`
   - Verify existing integration tests still pass

### Sprint N+2: DAP Client + Strategies

**Goal:** Create standalone DAP client, implement Python and Node strategies.

1. **Create `src/dap/DapClient.ts`**
   - stdio/TCP connection
   - Send/receive DAP messages
   - Event bus for stopped/terminated/output events

2. **Create `src/strategies/PythonStrategy.ts`**
   - Implement `normalizeFrameId()` with VS Code context awareness
   - Implement `normalizeFrame()` for debugpy quirks
   - Implement `normalizeVariable()` for Python types

3. **Create `src/strategies/NodeStrategy.ts`**
   - Pass-through implementation (Node works correctly)

4. **Create `src/adapters/TerminalSessionAdapter.ts`**
   - Implements `ISessionAdapter` using `DapClient` + strategy
   - No vscode imports

5. **Write tests**
   - DAP client integration tests (connect to real debugpy, node)
   - Python strategy unit tests (frameId normalization)
   - Node strategy unit tests

### Sprint N+3: Terminal/MCP Path

**Goal:** Enable autonomous debugging without VS Code.

1. **Create CLI entry point**
   - Parse config, select strategy, launch adapter
   - Use `SessionManager` + `DapClient`

2. **Create MCP server**
   - Expose `SessionManager` operations as MCP tools
   - Same tools as `server.ts` HTTP API

3. **Write E2E tests**
   - Terminal path: debug Python/Node app via CLI
   - MCP path: debug via MCP tools

---

## Configuration Parameters

All magic numbers should be at the top of files:

```typescript
const CONFIG = {
  // Server
  DEFAULT_PORT: 7890,
  
  // Timeouts
  SESSION_START_TIMEOUT_MS: 15_000,
  STOP_WAIT_TIMEOUT_MS: 15_000,
  EXTENSION_READY_TIMEOUT_MS: 20_000,
  SESSION_TEARDOWN_TIMEOUT_MS: 5_000,
  
  // DAP
  DEFAULT_THREAD_ID: 1,
  DEFAULT_STACK_LEVELS: 50,
  
  // Source listing
  DEFAULT_LIST_LINES: 11,
  
  // Test
  TEST_BREAKPOINT_LINE: 14,
  TEST_PYTHON_CONFIG: 'Debug test_app.py',
  TEST_NODE_CONFIG: 'Debug test_app.js',
  TEST_TYPESCRIPT_CONFIG: 'Debug test_app.ts',
};
```

---

## Key Files Reference

- **Architecture doc:** `.claude/agent-memory/architecture.md`
- **Sprint status:** `.claude/agent-memory/sprint-status.md`
- **The problem file:** `src/extension.ts` (all VS Code coupling)
- **Clean core:** `src/session.ts`, `src/breakpoints.ts`, `src/server.ts`
- **Tests:** `src/test/suite/sprint4.test.ts` (parameterized test factory pattern)
- **Feature specs:** `features/05_inspect_variables.feature` through `features/14_restart_and_restart_frame.feature`

---

## Summary

The refactoring is **mechanical** — extract classes, wire interfaces. The hard architectural decisions (Dependency Inversion, interfaces) are already done. The remaining work is **separating concerns** that were mixed in `extension.ts`.

The Python frameId problem becomes a `PythonStrategy` concern, not a global hack. Testing becomes possible without VS Code by mocking `DapClient` and testing strategies independently. The terminal/MCP path becomes possible by implementing `ISessionAdapter` with `DapClient` instead of `vscode.debug.*`.