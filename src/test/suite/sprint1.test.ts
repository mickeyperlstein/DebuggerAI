/**
 * Sprint 1 — Integration tests (@vscode/test-electron)
 *
 * Runs INSIDE VS Code's extension host — no ChromeDriver, no UI automation.
 * Commands are called with explicit args (bypassing InputBox prompts).
 * Results are checked against vscode.debug.breakpoints directly.
 */

import * as assert from 'assert';
import * as path   from 'path';
import * as vscode from 'vscode';

const FILE = path.resolve(__dirname, '../../../test_app.py');

// ── helpers ───────────────────────────────────────────────────────────────────

async function cmd(command: string, args?: object): Promise<any> {
  return vscode.commands.executeCommand(command, args);
}

function sourceBps(): vscode.SourceBreakpoint[] {
  return vscode.debug.breakpoints.filter(
    (b): b is vscode.SourceBreakpoint => b instanceof vscode.SourceBreakpoint,
  );
}

function bpAt(line: number): vscode.SourceBreakpoint | undefined {
  return sourceBps().find(b => b.location.range.start.line === line - 1);
}

// ── suite ─────────────────────────────────────────────────────────────────────

async function waitForExtension(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await vscode.commands.executeCommand('debuggingAI.listBreakpoints');
      return;
    } catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('Extension did not become ready within timeout');
}

suite('Sprint 1 — Breakpoint management', () => {

  suiteSetup(async function (this: Mocha.Context) {
    this.timeout(25_000);
    await waitForExtension();
  });

  setup(async () => {
    await cmd('debuggingAI.clearAllBreakpoints');
    await new Promise(r => setTimeout(r, 100));
  });

  // ── set ──────────────────────────────────────────────────────────────────

  test('set: adds a breakpoint at the given line', async () => {
    const r: any = await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 21, condition: null });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.line, 21);
    assert.strictEqual(r.data.condition, null);
    assert.ok(bpAt(21), 'breakpoint should appear in vscode.debug.breakpoints');
  });

  test('set: stores a condition', async () => {
    const r: any = await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 14, condition: 'a == 3' });
    assert.strictEqual(r.data.condition, 'a == 3');
    assert.strictEqual(bpAt(14)?.condition, 'a == 3');
  });

  test('set: rejects line < 1', async () => {
    const r: any = await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 0, condition: null });
    assert.strictEqual(r.ok, false);
  });

  // ── list ─────────────────────────────────────────────────────────────────

  test('list: returns all breakpoints', async () => {
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 14, condition: null });
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 21, condition: null });

    const r: any = await cmd('debuggingAI.listBreakpoints');
    assert.strictEqual(r.ok, true);
    const lines = r.data.map((b: any) => b.line).sort((a: number, b: number) => a - b);
    assert.deepStrictEqual(lines, [14, 21]);
  });

  // ── edit ─────────────────────────────────────────────────────────────────

  test('edit: updates condition', async () => {
    const set: any = await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 14, condition: 'a == 3' });
    const id = set.data.id;

    const r: any = await cmd('debuggingAI.editBreakpoint', { id, condition: 'a == 9' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.condition, 'a == 9');
    assert.strictEqual(bpAt(14)?.condition, 'a == 9');
  });

  test('edit: rejects unknown id', async () => {
    const r: any = await cmd('debuggingAI.editBreakpoint', { id: 'does-not-exist', condition: 'x' });
    assert.strictEqual(r.ok, false);
  });

  // ── clear ────────────────────────────────────────────────────────────────

  test('clear: removes one breakpoint by id', async () => {
    const set: any = await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 21, condition: null });
    const id = set.data.id;

    const r: any = await cmd('debuggingAI.clearBreakpoint', { id });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(bpAt(21), undefined);
  });

  test('clearAll: removes all breakpoints', async () => {
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 14, condition: null });
    await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 21, condition: null });

    const r: any = await cmd('debuggingAI.clearAllBreakpoints');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.data, []);
    assert.strictEqual(sourceBps().length, 0);
  });

  // ── disable / enable ─────────────────────────────────────────────────────

  test('disable / enable toggles enabled flag', async () => {
    const set: any = await cmd('debuggingAI.setBreakpoint', { file: FILE, line: 21, condition: null });
    const id = set.data.id;

    const off: any = await cmd('debuggingAI.editBreakpoint', { id, enabled: false });
    assert.strictEqual(off.data.enabled, false);

    const on: any = await cmd('debuggingAI.editBreakpoint', { id, enabled: true });
    assert.strictEqual(on.data.enabled, true);
  });
});
