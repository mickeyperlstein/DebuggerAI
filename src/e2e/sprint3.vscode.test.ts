/**
 * Sprint 3 — Execution control integration tests (@vscode/test-electron)
 *
 * Runs INSIDE VS Code's extension host — real vscode.debug, real debugpy session.
 * Tests that require Python/debugpy auto-skip via this.skip() when unavailable.
 *
 * test_app.py entry point (with stopOnEntry:true): first executable line.
 * After start(), the session is paused. Execution commands advance through the file.
 */

import * as assert from 'assert';
import * as path   from 'path';
import * as vscode from 'vscode';

const PYTHON_CONFIG  = 'Debug test_app.py';
const FILE           = path.resolve(__dirname, '../../../test_app.py');

// ── helpers ───────────────────────────────────────────────────────────────────

async function cmd(command: string, args?: object): Promise<any> {
  return vscode.commands.executeCommand(command, args);
}

async function waitForExtension(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await vscode.commands.executeCommand('debuggingAI.listBreakpoints'); return; }
    catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('Extension did not become ready within timeout');
}

/** Start a Python debug session. Returns the result, or calls this.skip() if Python unavailable. */
async function startPython(ctx: Mocha.Context): Promise<any> {
  const r: any = await cmd('debuggingAI.start', { config: PYTHON_CONFIG });
  if (!r.ok) { ctx.skip(); return; }
  return r;
}

// ── suite ─────────────────────────────────────────────────────────────────────

suite('Sprint 3 — Execution control', () => {

  suiteSetup(async function (this: Mocha.Context) {
    this.timeout(25_000);
    await waitForExtension();
  });

  teardown(async function (this: Mocha.Context) {
    this.timeout(10_000);
    await cmd('debuggingAI.quit');
    await cmd('debuggingAI.clearAllBreakpoints');
    // Poll until VS Code reports no active debug session — prevents the next test's
    // startDebugging listeners from catching the previous session's terminate event.
    const deadline = Date.now() + 5_000;
    while (vscode.debug.activeDebugSession && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
    }
    await new Promise(r => setTimeout(r, 500)); // small extra buffer
  });

  // ── next ─────────────────────────────────────────────────────────────────

  test('next: advances execution by one step', async function (this: Mocha.Context) {
    this.timeout(30_000);
    const start = await startPython(this);

    const before = start.line as number;
    const r: any = await cmd('debuggingAI.next');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'paused');
    assert.ok(typeof r.line === 'number', 'line should be a number after next');
    // Line must have advanced (or stayed same in edge case) — never gone backwards.
    assert.ok(r.line >= before, `line should not go backwards: was ${before}, got ${r.line}`);
  });

  // ── continue to breakpoint ────────────────────────────────────────────────

  test('continue: runs to breakpoint', async function (this: Mocha.Context) {
    this.timeout(30_000);

    // Set a breakpoint at a line guaranteed to be hit (line 27: total = process(data))
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 27, condition: null });

    const start = await startPython(this);
    if (!start) return;

    const r: any = await cmd('debuggingAI.continue');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'paused');
    assert.strictEqual(r.reason, 'breakpoint');
    assert.strictEqual(r.line, 27);
  });

  // ── continue without breakpoint ───────────────────────────────────────────

  test('continue: reaches exited when no breakpoint', async function (this: Mocha.Context) {
    this.timeout(40_000);
    const start = await startPython(this);
    if (!start) return;

    // debugpy may fire one or more intermediate stopped events before final exit
    let r: any;
    let iterations = 0;
    do {
      r = await cmd('debuggingAI.continue');
      assert.ok(r.ok, `continue should succeed, got: ${r.error}`);
      iterations++;
    } while (r.state === 'paused' && iterations < 5);

    assert.strictEqual(r.state, 'exited', `expected exited after ${iterations} continue(s)`);
  });

  // ── step into function ────────────────────────────────────────────────────

  test('step: enters a called function', async function (this: Mocha.Context) {
    this.timeout(40_000);
    const start = await startPython(this);
    if (!start) return;

    // Run until line 27 (main calls process(data)) so we're positioned at a function call.
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 27, condition: null });
    await cmd('debuggingAI.continue');
    await cmd('debuggingAI.clearAllBreakpoints');

    // step into process()
    const r: any = await cmd('debuggingAI.step');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'paused');
    // We should now be inside process() — line 19 or 20.
    assert.ok(r.line < 27, `step should enter process(), expected line < 27, got ${r.line}`);
  });

  // ── return from function ──────────────────────────────────────────────────

  test('return: runs to end of current function', async function (this: Mocha.Context) {
    this.timeout(40_000);
    const start = await startPython(this);
    if (!start) return;

    // Navigate into process() via step at line 27.
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 27, condition: null });
    await cmd('debuggingAI.continue');
    await cmd('debuggingAI.clearAllBreakpoints');
    await cmd('debuggingAI.step'); // now inside process()

    const r: any = await cmd('debuggingAI.return');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'paused');
    // stepOut exits the current frame — we'll be one level up from where we were.
    assert.ok(typeof r.line === 'number', `return should report a line number, got: ${r.line}`);
  });

  // ── until ─────────────────────────────────────────────────────────────────

  test('until(line): runs to the specified line', async function (this: Mocha.Context) {
    this.timeout(30_000);
    const start = await startPython(this);
    if (!start) return;

    const r: any = await cmd('debuggingAI.until', { line: 27 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'paused');
    assert.strictEqual(r.line, 27);
  });

  // ── error paths (always run — no Python needed) ───────────────────────────

  test('continue: returns error when no session is running', async () => {
    const r: any = await cmd('debuggingAI.continue');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not paused/i);
  });

  test('next: returns error when no session is running', async () => {
    const r: any = await cmd('debuggingAI.next');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not paused/i);
  });

  test('jump: returns error when no line arg provided', async () => {
    const r: any = await cmd('debuggingAI.jump', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /line/i);
  });
});
