import * as vscode from 'vscode';
import { SessionManager } from './session';
import { SessionResult, StepResult, InspectResult } from './interfaces/IDebugger';
import { log } from './log';

export async function cmdStart(sm: SessionManager, args?: { config?: string }): Promise<SessionResult> {
  const configName = args?.config ?? await pickLaunchConfig();
  if (!configName) return { ok: false, state: 'idle', error: 'cancelled' };
  const r = await sm.start(configName);
  log({ cmd: 'start', result: r });
  if (!r.ok) vscode.window.showErrorMessage(`DebuggingAI: ${r.error}`);
  else vscode.window.showInformationMessage(`DebuggingAI: Session started (${r.state})`);
  return r;
}

export async function cmdQuit(sm: SessionManager): Promise<SessionResult> {
  const r = await sm.quit();
  log({ cmd: 'quit', result: r });
  void vscode.window.showInformationMessage('DebuggingAI: Session stopped');
  return r;
}

export async function cmdRestart(sm: SessionManager, args?: { args?: string }): Promise<SessionResult> {
  const r = await sm.restart(args?.args);
  log({ cmd: 'restart', result: r });
  if (!r.ok) vscode.window.showErrorMessage(`DebuggingAI: ${r.error}`);
  else void vscode.window.showInformationMessage('DebuggingAI: Session restarted');
  return r;
}

export async function cmdStatus(sm: SessionManager): Promise<SessionResult> {
  const r = await sm.status();
  log({ cmd: 'status', result: r });
  return r;
}

// ── Sprint 3 — execution control ──────────────────────────────────────────────

export async function cmdContinue(sm: SessionManager): Promise<StepResult> {
  const r = await sm.continue();
  log({ cmd: 'continue', result: r });
  return r;
}

export async function cmdNext(sm: SessionManager): Promise<StepResult> {
  const r = await sm.next();
  log({ cmd: 'next', result: r });
  return r;
}

export async function cmdStep(sm: SessionManager): Promise<StepResult> {
  const r = await sm.step();
  log({ cmd: 'step', result: r });
  return r;
}

export async function cmdReturn(sm: SessionManager): Promise<StepResult> {
  const r = await sm.return();
  log({ cmd: 'return', result: r });
  return r;
}

export async function cmdUntil(sm: SessionManager, args?: { line?: number }): Promise<StepResult> {
  const r = await sm.until(args?.line);
  log({ cmd: 'until', result: r });
  return r;
}

export async function cmdJump(sm: SessionManager, args?: { line?: number }): Promise<StepResult> {
  if (args?.line === undefined) return { ok: false, state: 'paused', error: 'line is required' };
  const r = await sm.jump(args.line);
  log({ cmd: 'jump', result: r });
  return r;
}

// ── Sprint 4 — inspection ──────────────────────────────────────────────────

export async function cmdPrint(sm: SessionManager, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { ok: false, error: 'print requires expression' };
  const r = await sm.print(args.expression);
  log({ cmd: 'print', result: r });
  return r;
}

export async function cmdPrettyPrint(sm: SessionManager, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { ok: false, error: 'prettyPrint requires expression' };
  const r = await sm.prettyPrint(args.expression);
  log({ cmd: 'prettyPrint', result: r });
  return r;
}

export async function cmdWhatis(sm: SessionManager, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { ok: false, error: 'whatis requires expression' };
  const r = await sm.whatis(args.expression);
  log({ cmd: 'whatis', result: r });
  return r;
}

export async function cmdExec(sm: SessionManager, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { ok: false, error: 'exec requires expression' };
  const r = await sm.exec(args.expression);
  log({ cmd: 'exec', result: r });
  return r;
}

export async function cmdDisplay(sm: SessionManager, args?: { expression?: string }): Promise<InspectResult> {
  const r = await sm.display(args?.expression);
  log({ cmd: 'display', result: r });
  return r;
}

export async function cmdUndisplay(sm: SessionManager, args?: { expression?: string }): Promise<InspectResult> {
  const r = await sm.undisplay(args?.expression);
  log({ cmd: 'undisplay', result: r });
  return r;
}

export async function cmdArgs(sm: SessionManager): Promise<InspectResult> {
  const r = await sm.args();
  log({ cmd: 'args', result: r });
  return r;
}

export async function cmdRetval(sm: SessionManager): Promise<InspectResult> {
  const r = await sm.retval();
  log({ cmd: 'retval', result: r });
  return r;
}

function pickLaunchConfig(): Thenable<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const configs = vscode.workspace.getConfiguration('launch', folder).get<any[]>('configurations', []);
  if (!configs.length) return Promise.resolve(undefined);
  return vscode.window.showQuickPick(
    configs.map((c: any) => c.name as string),
    { placeHolder: 'Select launch configuration' },
  );
}
