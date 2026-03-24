# Integration Tests

> These tests run inside a real VS Code instance. They control the editor, call live extension commands, and assert against `vscode.debug.breakpoints` directly — no mocks, no stubs, no fakes.

## What makes them different from unit tests

| | Unit tests (`npm test`) | Integration tests (`npm run test:integration`) |
|---|---|---|
| Framework | Jest | Mocha via `@vscode/test-electron` |
| VS Code present | No — `vscode` is mocked | Yes — real VS Code process |
| Commands | Called on a fake manager | Called via `vscode.commands.executeCommand` |
| Breakpoints | Checked in BreakpointManager's Map | Checked in `vscode.debug.breakpoints` |
| DAP / adapter | Never touched | Real `vscode.debug` API fires |
| Speed | ~1s | ~15s (VS Code boot) |

---

## How to run

### Terminal
```bash
npm run compile          # required — tests run against out/, not src/
npm run test:integration # downloads VS Code 1.96.4 on first run, then cached
```

### VS Code beaker (Test Explorer)
1. Install the **Extension Test Runner** extension (`ms-vscode.extension-test-runner`)
2. Open the beaker sidebar — the suite appears automatically (reads `.vscode-test.mjs`)
3. Click ▶ next to the suite or any individual test

### Debug a single test
1. Open [src/test/suite/sprint1.test.ts](src/test/suite/sprint1.test.ts)
2. Set a breakpoint on any line
3. In the beaker, click the debug icon (🐛) next to the test
4. VS Code launches the test host, hits your breakpoint, lets you step through

---

## What happens when you run

```
npm run test:integration
```

```
1. tsc compiles src/ → out/

2. out/test/runTest.js starts
   └─ deletes ELECTRON_RUN_AS_NODE from env
      (Claude Code / VS Code extension hosts export this — it turns the
       Electron binary into raw Node.js, breaking test discovery)

3. @vscode/test-electron downloads VS Code 1.96.4 (arm64, cached after first run)
   └─ stored in .vscode-test/vscode-darwin-arm64-1.96.4/

4. VS Code launches as a child process with:
   --extensionDevelopmentPath = this repo
   --extensionTestsPath       = out/test/suite/index.js
   --user-data-dir            = /tmp/vscode-debuggingai-test
      (isolated profile — prevents conflict with your open VS Code window)

5. VS Code starts a fresh Extension Development Host
   └─ loads DebuggingAI from this repo (same as pressing F5)
   └─ activates the extension (port 7890 will be unavailable if your
      dev window is open — the warning is suppressed, tests proceed)

6. out/test/suite/index.js is loaded inside the extension host
   └─ Mocha discovers out/test/suite/sprint1.test.js
   └─ suiteSetup polls debuggingAI.listBreakpoints until it responds
      (proves the extension is fully activated before tests start)

7. Each test runs inside the SAME process that has vscode available
   └─ calls vscode.commands.executeCommand('debuggingAI.setBreakpoint', args)
   └─ the real extension code runs: BreakpointManager → IDebugAdapter → vscode.debug.addBreakpoints()
   └─ asserts against vscode.debug.breakpoints (the actual VS Code breakpoint store)

8. Mocha reports pass/fail to stdout — piped back to your terminal
   └─ you also see the DebuggingAI Output Channel logging inside the test VS Code window

9. VS Code exits, runTest.js exits with 0 (all pass) or 1 (any fail)
```

---

## The test flow in detail

```
Your terminal
    │
    └─ node out/test/runTest.js
            │
            └─ @vscode/test-electron spawns VS Code 1.96.4
                        │
                        ├─ Extension Host process (pid: XXXXX)
                        │       │
                        │       ├─ DebuggingAI activates
                        │       │     ├─ BreakpointManager created
                        │       │     ├─ HTTP server tries port 7890 → fails (dev window has it)
                        │       │     ├─ warning fired and forgotten (void)
                        │       │     └─ 5 commands registered
                        │       │
                        │       └─ Mocha test suite loads
                        │             │
                        │             ├─ suiteSetup: polls listBreakpoints until ready
                        │             │
                        │             ├─ setup (each test): clearAllBreakpoints
                        │             │
                        │             ├─ test: setBreakpoint {file, line:21, condition:null}
                        │             │     │
                        │             │     ├─ executeCommand('debuggingAI.setBreakpoint', args)
                        │             │     ├─ cmdSet → mgr.set() → adapter.addBreakpoint()
                        │             │     ├─ vscode.debug.addBreakpoints([SourceBreakpoint])
                        │             │     └─ assert vscode.debug.breakpoints[0].line === 21  ✔
                        │             │
                        │             ├─ test: setBreakpoint with condition  ✔
                        │             ├─ test: listBreakpoints               ✔
                        │             ├─ test: editBreakpoint condition      ✔
                        │             ├─ test: editBreakpoint rejects bad id ✔
                        │             ├─ test: clearBreakpoint               ✔
                        │             ├─ test: clearAllBreakpoints           ✔
                        │             └─ test: disable / enable              ✔
                        │
                        └─ stdout piped → your terminal
                              9 passing (979ms)
```

---

## Key files

| File | Purpose |
|---|---|
| [src/test/runTest.ts](src/test/runTest.ts) | Entry point — unsets `ELECTRON_RUN_AS_NODE`, downloads VS Code, launches test host |
| [src/test/suite/index.ts](src/test/suite/index.ts) | Mocha runner — discovers `*.test.js` in the same directory |
| [src/test/suite/sprint1.test.ts](src/test/suite/sprint1.test.ts) | Sprint 1 test cases |
| [.vscode-test.mjs](.vscode-test.mjs) | Config for Extension Test Runner (beaker integration) |

---

## Adding tests for future sprints

1. Create `src/test/suite/sprint2.test.ts`
2. Write tests using `vscode.commands.executeCommand('debuggingAI.start', args)`
3. `npm run compile` — Mocha picks it up automatically (no registration needed)
4. Run `npm run test:integration`

The index runner discovers all `*.test.js` files in `out/test/suite/` at runtime.

---

## Known quirks

**"Timed out waiting for authentication provider to register"**
VS Code's Settings Sync tries to register an auth provider during boot and times out in the isolated profile. This is VS Code's own message — it does not affect our tests.

**Port 7890 unavailable**
Expected when your dev VS Code window is open. The HTTP server (used by the bash CLI) is disabled in this scenario. Tests use `vscode.commands.executeCommand` directly and are unaffected.

**`ELECTRON_RUN_AS_NODE=1` in environment**
Claude Code and VS Code extension hosts export this variable, which makes the Electron binary behave as raw Node.js. `runTest.ts` deletes it before spawning VS Code. Without this fix, all CLI flags including `--extensionDevelopmentPath` are rejected as "bad option".
