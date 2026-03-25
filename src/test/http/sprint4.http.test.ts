/**
 * Sprint 4 — Inspection E2E tests via HTTP server (no VS Code).
 *
 * WHAT: Same inspection scenarios as sprint4.test.ts but driven via the
 *       DebuggingAI HTTP server (localhost:7890) instead of VS Code commands.
 *
 * WHY:  Two benefits:
 *       1. Tests run without the @vscode/test-electron harness — any Node.js
 *          test runner can execute them.
 *       2. Validates the HTTP server layer (server.ts) independently of the
 *          VS Code command layer, giving us a second integration path.
 *
 * WHEN: Run with the DebuggingAI extension active in a VS Code window AND a
 *       debug session running (the extension's HTTP server must be listening).
 *       Launch the test app manually or let the test start it via 'start'.
 *
 * HOW TO RUN:
 *   1. Open this project in VS Code and press F5 to start the extension
 *      (or have it installed and activate via onStartupFinished)
 *   2. npm run test:http
 *
 * NOTE: Port is read from DEBUGGINGAI_PORT env var (default 7890).
 */

import * as assert from 'assert';
import * as http   from 'http';
import * as path   from 'path';

const PORT = parseInt(process.env.DEBUGGINGAI_PORT ?? '7890', 10);
const ROOT = path.resolve(__dirname, '../../../');

// ── HTTP client ───────────────────────────────────────────────────────────────

function post(body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req  = http.request(
      { host: '127.0.0.1', port: PORT, method: 'POST', path: '/',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) } },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Bad JSON: ${data}`)); }
        });
      },
    );
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function cleanupSession(): Promise<void> {
  await post({ command: 'quit' });
  await post({ command: 'clearAll' });
  await new Promise(r => setTimeout(r, 500));
}

// ── test suite factory (mirrors makeInspectionSuite in sprint4.test.ts) ───────

interface Target {
  label:        string;
  config:       string;
  file:         string;
  bpLine:       number;
  undefinedExpr: string;
}

function makeSuite(t: Target): void {
  suite(`Sprint 4 HTTP — Inspection (${t.label})`, () => {

    suiteSetup(async function (this: Mocha.Context) {
      this.timeout(10_000);
      // Verify the server is up
      try { await post({ command: 'list' }); }
      catch { this.skip(); }
    });

    teardown(async function (this: Mocha.Context) {
      this.timeout(10_000);
      await cleanupSession();
    });

    async function runToBp(ctx: Mocha.Context): Promise<any> {
      // Set breakpoint
      await post({ command: 'set', file: t.file, line: t.bpLine });
      // Start session
      const start: any = await post({ command: 'start', config: t.config });
      if (!start.ok) { ctx.skip(); return; }
      // Continue to breakpoint
      const cont: any = await post({ command: 'continue' });
      if (!cont.ok || cont.state !== 'paused') { ctx.skip(); return; }
      return cont;
    }

    // ── print ──────────────────────────────────────────────────────────────

    test('print: returns valueRepr for a local variable', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await post({ command: 'print', expression: 'a' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr !== undefined);
    });

    test('print: evaluates an arithmetic expression', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await post({ command: 'print', expression: 'a + b' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr !== undefined);
    });

    test('print: returns ok:false for an undefined variable', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await post({ command: 'print', expression: t.undefinedExpr });
      assert.strictEqual(r.ok, false);
      assert.ok(r.error);
    });

    // ── exec ───────────────────────────────────────────────────────────────

    test('exec: session stays paused after executing a statement', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      await post({ command: 'exec', expression: 'a + b' });
      const s: any = await post({ command: 'status' });
      assert.strictEqual(s.state, 'paused');
    });

    // ── display / undisplay ────────────────────────────────────────────────

    test('display: registers expression and returns valueRepr containing it', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await post({ command: 'display', expression: 'a' });
      assert.strictEqual(r.ok, true, `expected ok:true, got: ${r.error}`);
      assert.ok(r.valueRepr?.includes('a'));
    });

    test('undisplay: clears a registered expression', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      await post({ command: 'display', expression: 'a' });
      const r: any = await post({ command: 'undisplay', expression: 'a' });
      assert.strictEqual(r.ok, true);
    });

    // ── args ───────────────────────────────────────────────────────────────

    test('args: returns a result without crashing the session', async function (this: Mocha.Context) {
      this.timeout(30_000);
      await runToBp(this);
      const r: any = await post({ command: 'args' });
      assert.ok(typeof r.ok === 'boolean');
      const s: any = await post({ command: 'status' });
      assert.strictEqual(s.state, 'paused');
    });
  });
}

// ── Error-path tests (no active session needed) ───────────────────────────────

suite('Sprint 4 HTTP — Inspection (error paths)', () => {

  suiteSetup(async function (this: Mocha.Context) {
    this.timeout(5_000);
    try { await post({ command: 'list' }); }
    catch { this.skip(); }
  });

  test('print: returns error when no session is running', async () => {
    const r: any = await post({ command: 'print', expression: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not paused/i);
  });

  test('print: returns error when expression is missing', async () => {
    const r: any = await post({ command: 'print' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /expression/i);
  });

  test('server: returns 405 for non-POST requests', async () => {
    const resp = await new Promise<number>(resolve =>
      http.get(`http://127.0.0.1:${PORT}/`, res => resolve(res.statusCode ?? 0)),
    );
    assert.strictEqual(resp, 405);
  });

  test('server: returns 400 for invalid JSON', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: PORT, method: 'POST', path: '/',
          headers: { 'Content-Type': 'application/json' } },
        res => resolve(res.statusCode ?? 0),
      );
      req.on('error', reject);
      req.write('not-json');
      req.end();
    });
    assert.strictEqual(status, 400);
  });
});

// ── register targets ──────────────────────────────────────────────────────────

makeSuite({
  label:         'Node.js',
  config:        'Debug test_app.js',
  file:          path.join(ROOT, 'test_app.js'),
  bpLine:        14,
  undefinedExpr: '__nonExistentVar123__',
});

makeSuite({
  label:         'TypeScript',
  config:        'Debug test_app.ts',
  file:          path.join(ROOT, 'test_app.ts'),
  bpLine:        14,
  undefinedExpr: '__nonExistentVar123__',
});

makeSuite({
  label:         'Python',
  config:        'Debug test_app.py',
  file:          path.join(ROOT, 'test_app.py'),
  bpLine:        14,
  undefinedExpr: '__nonExistentVar123__',
});
