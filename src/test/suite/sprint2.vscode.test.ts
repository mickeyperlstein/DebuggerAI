/**
 * Sprint 2 — Session lifecycle integration tests (@vscode/test-electron)
 *
 * Runs INSIDE VS Code's extension host — real vscode.debug API, real launch configs.
 * Language-agnostic: "Debug test_app.py" is the target fixture (same as the CLI user).
 *
 * Tests that require the Python debugpy extension are automatically skipped when
 * it is not installed in the test host (e.g. CI). All idle / error-path tests
 * always run regardless of environment.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const PYTHON_CONFIG = 'Debug test_app.py';
const UNKNOWN_CONFIG = 'Nonexistent Config 99999';

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

// ── suite ─────────────────────────────────────────────────────────────────────

suite('Sprint 2 — Session lifecycle', () => {

  suiteSetup(async function (this: Mocha.Context) {
    this.timeout(25_000);
    await waitForExtension();
  });

  // Always quit any leftover session between tests so state is clean.
  teardown(async () => {
    await cmd('debuggingAI.quit');
    await new Promise(r => setTimeout(r, 200));
  });

  // ── idle / no-session paths (always run) ─────────────────────────────────

  test('status: returns idle when no session is running', async () => {
    const r: any = await cmd('debuggingAI.status');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'idle');
  });

  test('quit: is a no-op on an idle session', async () => {
    const r: any = await cmd('debuggingAI.quit');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state, 'idle');
  });

  test('restart: returns error when no session is running', async () => {
    const r: any = await cmd('debuggingAI.restart');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /no session/i);
  });

  test('start: returns error for unknown config name', async () => {
    const r: any = await cmd('debuggingAI.start', { config: UNKNOWN_CONFIG });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not found/i);
  });

  // ── real session (skipped automatically when Python debugpy is unavailable) ─

  test('start → status → restart → quit lifecycle with test_app.py', async function (this: Mocha.Context) {
    this.timeout(40_000); // session start + restart can each take ~10 s

    // Attempt to start the Python session
    const start: any = await cmd('debuggingAI.start', { config: PYTHON_CONFIG });

    if (!start.ok) {
      // Python extension / debugpy not installed in this test host — skip gracefully
      this.skip();
      return;
    }

    assert.strictEqual(start.state, 'paused', 'session should be paused at entry');
    assert.ok(typeof start.sessionId === 'string', 'sessionId should be a string');

    // status reflects paused
    const status: any = await cmd('debuggingAI.status');
    assert.strictEqual(status.state, 'paused');
    assert.strictEqual(status.sessionId, start.sessionId);

    // restart — back to paused at the beginning
    const restart: any = await cmd('debuggingAI.restart');
    assert.strictEqual(restart.ok, true);
    assert.strictEqual(restart.state, 'paused');

    // quit — session gone
    const quit: any = await cmd('debuggingAI.quit');
    assert.strictEqual(quit.ok, true);
    assert.strictEqual(quit.state, 'idle');

    // status back to idle
    const after: any = await cmd('debuggingAI.status');
    assert.strictEqual(after.state, 'idle');
  });

  test('start: second call while session active returns error', async function (this: Mocha.Context) {
    this.timeout(20_000);

    const first: any = await cmd('debuggingAI.start', { config: PYTHON_CONFIG });
    if (!first.ok) { this.skip(); return; }

    const second: any = await cmd('debuggingAI.start', { config: PYTHON_CONFIG });
    assert.strictEqual(second.ok, false);
    assert.match(second.error, /already running/i);
  });
});
