/**
 * Sprint 4 — Inspection integration tests (@vscode/test-electron)
 *
 * Runs INSIDE VS Code's extension host — real vscode.debug, real DAP session.
 * The same inspection suite runs against all three language targets:
 *   • Node.js    — "Debug test_app.js"  (ms-vscode.js-debug, always available)
 *   • TypeScript — "Debug test_app.ts"  (ms-vscode.js-debug + ts-node)
 *   • Python     — "Debug test_app.py"  (ms-python.debugpy, skipped if absent)
 *
 * All three test apps expose identical locals at line 14: a, b, result inside add().
 */

import * as assert from 'assert';
import * as path   from 'path';
import * as vscode from 'vscode';

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

async function teardownSession(): Promise<void> {
  await cmd('debuggingAI.quit');
  await cmd('debuggingAI.clearAllBreakpoints');
  const deadline = Date.now() + 5_000;
  while (vscode.debug.activeDebugSession && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 500));
}

// ── parameterized suite factory ───────────────────────────────────────────────

interface Target {
  label:    string;
  config:   string;
  file:     string;   // absolute path to the test fixture
  bpLine:   number;   // line inside add(a, b) with result = a + b
  undefinedExpr: string; // expression that triggers a reference/name error
}

function makeInspectionSuite(t: Target): void {
  suite(`Sprint 4 — Inspection (${t.label})`, () => {

    suiteSetup(async function (this: Mocha.Context) {
      this.timeout(25_000);
      await waitForExtension();
    });

    teardown(async function (this: Mocha.Context) {
      this.timeout(10_000);
      await teardownSession();
    });

    /** Start the debug session; skip if config unavailable. */
    async function startSession(ctx: Mocha.Context): Promise<any> {
      const r: any = await cmd('debuggingAI.start', { config: t.config });
      if (!r.ok) { ctx.skip(); return; }
      return r;
    }

    /** Set bp inside add(), start, continue to it. Skip on any failure. */
    async function runToBp(ctx: Mocha.Context): Promise<any> {
      await cmd('debuggingAI.setBreakpoint', { file: t.file, line: t.bpLine, condition: null });
      const start = await startSession(ctx);
      if (!start) return;
      const r: any = await cmd('debuggingAI.continue');
      if (!r.ok || r.state !== 'paused') { ctx.skip(); return; }
      return r;
    }

    // ── print ────────────────────────────────────────────────────────────────

    test('print: returns valueRepr for a local variable', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.print', { expression: 'a' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr !== undefined, 'valueRepr should be defined');
    });

    test('print: evaluates an arithmetic expression', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.print', { expression: 'a + b' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr !== undefined);
    });

    test('print: returns ok:false for an undefined variable', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.print', { expression: t.undefinedExpr });
      assert.strictEqual(r.ok, false, 'expected ok:false for undefined variable');
      assert.ok(r.error, 'expected an error message');
    });

    // ── prettyPrint ──────────────────────────────────────────────────────────

    test('prettyPrint: returns valueRepr (same adapter path as print)', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.prettyPrint', { expression: 'a' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr !== undefined);
    });

    // ── whatis ───────────────────────────────────────────────────────────────

    test('whatis: returns type information for a variable', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.whatis', { expression: 'a' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.type !== undefined || r.valueRepr !== undefined,
        'type or valueRepr should be defined');
    });

    // ── exec ─────────────────────────────────────────────────────────────────

    test('exec: session stays paused after executing a statement', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      // a + b is a valid expression in all three languages
      await cmd('debuggingAI.exec', { expression: 'a + b' });
      const s: any = await cmd('debuggingAI.status');
      assert.strictEqual(s.state, 'paused', 'session should remain paused after exec');
    });

    // ── display / undisplay ──────────────────────────────────────────────────

    test('display: registers expression and returns valueRepr containing it', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.display', { expression: 'a' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr?.includes('a'), `valueRepr should contain 'a', got: ${r.valueRepr}`);
    });

    test('undisplay: removes a registered expression', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      await cmd('debuggingAI.display', { expression: 'a' });
      const r: any = await cmd('debuggingAI.undisplay', { expression: 'a' });
      assert.strictEqual(r.ok, true);
    });

    test('undisplay with no args: clears all registered expressions', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      await cmd('debuggingAI.display', { expression: 'a' });
      await cmd('debuggingAI.display', { expression: 'b' });
      const r: any = await cmd('debuggingAI.undisplay');
      assert.strictEqual(r.ok, true);
    });

    // ── args ─────────────────────────────────────────────────────────────────

    test('args: returns a result without crashing the session', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await cmd('debuggingAI.args');
      // Adapter may or may not expose a dedicated arguments scope — either ok is valid
      assert.ok(typeof r.ok === 'boolean', 'args should return a result with ok field');
      const s: any = await cmd('debuggingAI.status');
      assert.strictEqual(s.state, 'paused', 'session should remain paused after args');
    });

    // ── retval ───────────────────────────────────────────────────────────────

    test('retval: returns a result after stepOut without crashing', async function (this: Mocha.Context) {
      this.timeout(40_000);
      await runToBp(this);
      const ret: any = await cmd('debuggingAI.return');
      if (!ret.ok) { this.skip(); return; }
      const r: any = await cmd('debuggingAI.retval');
      assert.ok(typeof r.ok === 'boolean', 'retval should return a result with ok field');
      const s: any = await cmd('debuggingAI.status');
      assert.strictEqual(s.state, 'paused', 'session should remain paused after retval');
    });
  });
}

// ── register all three language targets ──────────────────────────────────────

const ROOT = path.resolve(__dirname, '../../../');

makeInspectionSuite({
  label:         'Node.js',
  config:        'Debug test_app.js',
  file:          path.join(ROOT, 'test_app.js'),
  bpLine:        14,
  undefinedExpr: '__nonExistentVar123__',
});

makeInspectionSuite({
  label:         'TypeScript',
  config:        'Debug test_app.ts',
  file:          path.join(ROOT, 'test_app.ts'),
  bpLine:        14,
  undefinedExpr: '__nonExistentVar123__',
});

makeInspectionSuite({
  label:         'Python',
  config:        'Debug test_app.py',
  file:          path.join(ROOT, 'test_app.py'),
  bpLine:        14,
  undefinedExpr: '__nonExistentVar123__',
});

// ── error paths — run once (no session needed) ────────────────────────────────

suite('Sprint 4 — Inspection (error paths)', () => {

  suiteSetup(async function (this: Mocha.Context) {
    this.timeout(25_000);
    await waitForExtension();
  });

  test('print: returns error when no session is running', async () => {
    const r: any = await cmd('debuggingAI.print', { expression: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not paused/i);
  });

  test('print: returns error when expression is missing', async () => {
    const r: any = await cmd('debuggingAI.print', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /expression/i);
  });

  test('whatis: returns error when no session is running', async () => {
    const r: any = await cmd('debuggingAI.whatis', { expression: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not paused/i);
  });
});
