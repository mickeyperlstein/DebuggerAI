import * as vscode from 'vscode';
import { BreakpointManager } from './breakpoints';
import { Breakpoint, BpResult, BpListResult } from './types';
import { log, show } from './log';

/**
 * All five breakpoint commands.
 * Every command follows: call manager → log → notify → return result.
 * No duplication — shared helpers handle the pattern.
 */

type CmdResult = BpResult | BpListResult;

function notify(r: CmdResult, msg: (d: Breakpoint | Breakpoint[]) => string) {
  if (r.ok && r.data != null) {
    vscode.window.showInformationMessage(`DebuggingAI: ${msg(r.data as any)}`);
  } else if (!r.ok) {
    vscode.window.showErrorMessage(`DebuggingAI: ${r.error}`);
  }
}

function bpLabel(bp: Breakpoint) {
  return `${bp.file}:${bp.line}${bp.condition ? ` (${bp.condition})` : ''}`;
}

// ── set ───────────────────────────────────────────────────────────────────────

export async function cmdSet(
  mgr: BreakpointManager,
  args?: { file?: string; line?: number; condition?: string | null },
): Promise<BpResult> {
  // Capture editor state NOW — activeTextEditor becomes undefined once any
  // input box or quick pick opens (VS Code shifts focus away from the editor).
  const editor = vscode.window.activeTextEditor;

  const file = args?.file ?? editor?.document.uri.fsPath
    ?? await prompt('File path', '/path/to/file');
  if (!file) return { error: 'cancelled', ok: false };

  const line = args?.line ?? (editor ? editor.selection.active.line + 1 : undefined)
    ?? Number(await prompt(`Line in ${file}`, '42', v => Number.isInteger(+v) && +v > 0 ? null : 'positive integer'));
  if (!line) return { error: 'cancelled', ok: false };

  const condition = args?.condition !== undefined ? args.condition
    : await vscode.window.showInputBox({ prompt: 'Condition (optional)', placeHolder: 'x > 100' })
      .then(v => v?.trim() || null);

  const r = mgr.set(file, line, condition ?? null);
  log({ cmd: 'set', result: r });
  notify(r, d => `Breakpoint set at ${bpLabel(d as Breakpoint)}`);
  return r;
}

// ── edit ──────────────────────────────────────────────────────────────────────

export async function cmdEdit(
  mgr: BreakpointManager,
  args?: { id?: string; condition?: string | null; enabled?: boolean; line?: number },
): Promise<BpResult> {
  const { data: bps = [] } = mgr.list();
  if (!bps.length) return { error: 'no breakpoints', ok: false };

  const id = args?.id ?? await pickBreakpoint(bps);
  if (!id) return { error: 'cancelled', ok: false };

  const patch: Parameters<typeof mgr.edit>[1] = {};
  const hasExplicitFields = args?.enabled !== undefined || args?.line !== undefined;

  if (args?.condition !== undefined) patch.condition = args.condition;
  else if (!hasExplicitFields) patch.condition = await vscode.window.showInputBox({
    prompt: 'New condition (clear to remove)',
    value: bps.find(b => b.id === id)?.condition ?? '',
  }).then(v => v?.trim() || null);

  if (args?.enabled  !== undefined) patch.enabled = args.enabled;
  if (args?.line     !== undefined) patch.line    = args.line;

  const r = mgr.edit(id, patch);
  log({ cmd: 'edit', result: r });
  notify(r, d => `Breakpoint updated: ${bpLabel(d as Breakpoint)}`);
  return r;
}

// ── list ──────────────────────────────────────────────────────────────────────

export function cmdList(mgr: BreakpointManager): BpListResult {
  const r = mgr.list();
  show();
  log({ cmd: 'list', result: r });
  return r;
}

// ── clear ─────────────────────────────────────────────────────────────────────

export async function cmdClear(mgr: BreakpointManager, args?: { id?: string }): Promise<BpResult> {
  const { data: bps = [] } = mgr.list();
  const id = args?.id ?? await pickBreakpoint(bps);
  if (!id) return { error: 'cancelled', ok: false };

  const r = mgr.clear(id);
  log({ cmd: 'clear', result: r });
  notify(r, d => `Breakpoint cleared: ${bpLabel(d as Breakpoint)}`);
  return r;
}

// ── clearAll ──────────────────────────────────────────────────────────────────

export function cmdClearAll(mgr: BreakpointManager): BpListResult {
  const r = mgr.clearAll();
  log({ cmd: 'clearAll' });
  vscode.window.showInformationMessage('DebuggingAI: All breakpoints cleared');
  return r;
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function prompt(p: string, ph: string, validate?: (v: string) => string | null) {
  return vscode.window.showInputBox({ prompt: p, placeHolder: ph, validateInput: validate });
}

function pickBreakpoint(bps: Breakpoint[]): Thenable<string | undefined> {
  return vscode.window.showQuickPick(
    bps.map(bp => ({ label: bpLabel(bp), id: bp.id })),
    { placeHolder: 'Select breakpoint' },
  ).then(p => p?.id);
}
