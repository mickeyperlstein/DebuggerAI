/**
 * Sprint 1 — End-to-end tests (vscode-extension-tester)
 *
 * Runs inside a real VS Code Extension Development Host.
 * Tests the full stack: command palette → extension → vscode.debug API → output channel.
 *
 * Run: npm run test:e2e
 */

import { expect } from 'chai';
import * as path from 'path';
import {
  VSBrowser,
  WebDriver,
  EditorView,
  BottomBarPanel,
  Workbench,
  InputBox,
  TextEditor,
} from 'vscode-extension-tester';

const TEST_FILE = path.resolve(__dirname, '../../test_app.py');
const CHANNEL   = 'DebuggingAI';

// ── helpers ───────────────────────────────────────────────────────────────────

async function openTestFile(driver: WebDriver): Promise<TextEditor> {
  const bench = new Workbench();
  await bench.openCommandPrompt();
  const input = await InputBox.create();
  await input.setText(TEST_FILE);
  await input.confirm();
  await driver.sleep(800);
  return new TextEditor(new EditorView());
}

async function runCommand(name: string): Promise<void> {
  await new Workbench().executeCommand(name);
}

async function getOutputLines(): Promise<string[]> {
  const panel  = new BottomBarPanel();
  await panel.toggle(true);
  const output = await panel.openOutputView();
  await output.selectChannel(CHANNEL);
  const text = await output.getText();
  return text.split('\n').filter(l => l.trim());
}

async function lastJson(): Promise<Record<string, unknown>> {
  const lines = await getOutputLines();
  const last  = [...lines].reverse().find(l => l.includes('{'));
  if (!last) throw new Error('No JSON found in output channel');
  return JSON.parse(last.replace(/^\[.*?\]\s*/, ''));
}

async function dismissConditionPrompt(condition = ''): Promise<void> {
  const input = await InputBox.create();
  await input.setText(condition);
  await input.confirm();
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Sprint 1 — Breakpoint management', function (this: Mocha.Suite) {
  this.timeout(30_000);

  let driver: WebDriver;
  let editor: TextEditor;

  before(async function () {
    driver = VSBrowser.instance.driver;
    editor = await openTestFile(driver);
    await runCommand('debuggingAI.clearAllBreakpoints');
    await driver.sleep(300);
  });

  // ── set ──────────────────────────────────────────────────────────────────

  it('sets a breakpoint at the cursor line', async function () {
    await editor.moveCursor(21, 1);
    await runCommand('debuggingAI.setBreakpoint');
    await dismissConditionPrompt();
    await driver.sleep(400);

    const json = await lastJson();
    expect(json.cmd).to.equal('set');
    expect((json.result as any).ok).to.be.true;
    expect((json.result as any).data.line).to.equal(21);
    expect((json.result as any).data.condition).to.be.null;
  });

  it('sets a conditional breakpoint', async function () {
    await editor.moveCursor(14, 1);
    await runCommand('debuggingAI.setBreakpoint');
    await dismissConditionPrompt('a == 3');
    await driver.sleep(400);

    const json = await lastJson();
    expect((json.result as any).data.line).to.equal(14);
    expect((json.result as any).data.condition).to.equal('a == 3');
  });

  // ── list ─────────────────────────────────────────────────────────────────

  it('lists all breakpoints', async function () {
    await runCommand('debuggingAI.listBreakpoints');
    await driver.sleep(400);

    const json  = await lastJson();
    expect(json.cmd).to.equal('list');
    const data  = (json.result as any).data as any[];
    const lines = data.map((b: any) => b.line).sort((a: number, b: number) => a - b);
    expect(lines).to.deep.equal([14, 21]);
  });

  // ── edit ─────────────────────────────────────────────────────────────────

  it('edits the condition on an existing breakpoint', async function () {
    const listJson = await lastJson();
    const bp       = (listJson.result as any).data.find((b: any) => b.line === 14);

    await runCommand('debuggingAI.editBreakpoint');
    const idBox = await InputBox.create();
    await idBox.setText(bp.id);
    await idBox.confirm();
    const condBox = await InputBox.create();
    await condBox.setText('a == 5');
    await condBox.confirm();
    await driver.sleep(400);

    const json = await lastJson();
    expect(json.cmd).to.equal('edit');
    expect((json.result as any).data.condition).to.equal('a == 5');
  });

  // ── clear ────────────────────────────────────────────────────────────────

  it('clears a single breakpoint by ID', async function () {
    const listJson = await lastJson();
    const bp       = (listJson.result as any).data.find((b: any) => b.line === 21);

    await runCommand('debuggingAI.clearBreakpoint');
    const idBox = await InputBox.create();
    await idBox.setText(bp.id);
    await idBox.confirm();
    await driver.sleep(400);

    const json = await lastJson();
    expect(json.cmd).to.equal('clear');
    expect((json.result as any).ok).to.be.true;
  });

  it('clears all remaining breakpoints', async function () {
    await runCommand('debuggingAI.clearAllBreakpoints');
    await driver.sleep(400);

    const json = await lastJson();
    expect(json.cmd).to.equal('clearAll');
    expect((json.result as any).data).to.deep.equal([]);
  });

  // ── sync ─────────────────────────────────────────────────────────────────

  it('syncs a breakpoint set manually in the gutter', async function () {
    await editor.moveCursor(9, 1);
    await editor.toggleBreakpoint(9);
    await driver.sleep(400);

    const lines    = await getOutputLines();
    const syncLine = [...lines].reverse().find(l => l.includes('bp_sync'));
    expect(syncLine, 'bp_sync log entry').to.not.be.undefined;

    const json = JSON.parse(syncLine!.replace(/^\[.*?\]\s*/, ''));
    expect(json.event).to.equal('bp_sync');
    expect(json.op).to.equal('added');
    expect(json.line).to.equal(9);
  });
});
