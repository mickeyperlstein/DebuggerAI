import * as vscode from 'vscode';
import { DebugStateMachine } from './session';
import { SessionResult, StepResult, InspectResult } from './interfaces/IDebugger';
import { log } from './log';

export async function cmdStart(sm: DebugStateMachine, args?: { config?: string }): Promise<SessionResult> {
  const configName = args?.config ?? await pickLaunchConfig();
  if (!configName) return { state: 'idle', error: 'cancelled', ok: false };
  const r = await sm.start(configName);
  log({ cmd: 'start', result: r });
  if (!r.ok) vscode.window.showErrorMessage(`DebuggingAI: ${r.error}`);
  else vscode.window.showInformationMessage(`DebuggingAI: Session started (${r.state})`);
  return r;
}

export async function cmdQuit(sm: DebugStateMachine): Promise<SessionResult> {
  const r = await sm.quit();
  log({ cmd: 'quit', result: r });
  void vscode.window.showInformationMessage('DebuggingAI: Session stopped');
  return r;
}

export async function cmdRestart(sm: DebugStateMachine, args?: { args?: string }): Promise<SessionResult> {
  const r = await sm.restart(args?.args);
  log({ cmd: 'restart', result: r });
  if (!r.ok) vscode.window.showErrorMessage(`DebuggingAI: ${r.error}`);
  else void vscode.window.showInformationMessage('DebuggingAI: Session restarted');
  return r;
}

export async function cmdStatus(sm: DebugStateMachine): Promise<SessionResult> {
  const r = await sm.status();
  log({ cmd: 'status', result: r });
  return r;
}

// ── Sprint 3 — execution control ──────────────────────────────────────────────

export async function cmdContinue(sm: DebugStateMachine): Promise<StepResult> {
  const r = await sm.continue();
  log({ cmd: 'continue', result: r });
  return r;
}

export async function cmdNext(sm: DebugStateMachine): Promise<StepResult> {
  const r = await sm.next();
  log({ cmd: 'next', result: r });
  return r;
}

export async function cmdStep(sm: DebugStateMachine): Promise<StepResult> {
  const r = await sm.step();
  log({ cmd: 'step', result: r });
  return r;
}

export async function cmdReturn(sm: DebugStateMachine): Promise<StepResult> {
  const r = await sm.return();
  log({ cmd: 'return', result: r });
  return r;
}

export async function cmdUntil(sm: DebugStateMachine, args?: { line?: number }): Promise<StepResult> {
  const r = await sm.until(args?.line);
  log({ cmd: 'until', result: r });
  return r;
}

export async function cmdJump(sm: DebugStateMachine, args?: { line?: number }): Promise<StepResult> {
  if (args?.line === undefined) return { state: 'paused', error: 'line is required', ok: false };
  const r = await sm.jump(args.line);
  log({ cmd: 'jump', result: r });
  return r;
}

// ── Sprint 4 — inspection ──────────────────────────────────────────────────

export async function cmdPrint(sm: DebugStateMachine, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { error: 'print requires expression', ok: false };
  const r = await sm.print(args.expression);
  log({ cmd: 'print', result: r });
  return r;
}

export async function cmdPrettyPrint(sm: DebugStateMachine, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { error: 'prettyPrint requires expression', ok: false };
  const r = await sm.prettyPrint(args.expression);
  log({ cmd: 'prettyPrint', result: r });
  return r;
}

export async function cmdWhatis(sm: DebugStateMachine, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { error: 'whatis requires expression', ok: false };
  const r = await sm.whatis(args.expression);
  log({ cmd: 'whatis', result: r });
  return r;
}

export async function cmdExec(sm: DebugStateMachine, args?: { expression?: string }): Promise<InspectResult> {
  if (!args?.expression) return { error: 'exec requires expression', ok: false };
  const r = await sm.exec(args.expression);
  log({ cmd: 'exec', result: r });
  return r;
}

export async function cmdDisplay(sm: DebugStateMachine, args?: { expression?: string }): Promise<InspectResult> {
  const r = await sm.display(args?.expression);
  log({ cmd: 'display', result: r });
  return r;
}

export async function cmdUndisplay(sm: DebugStateMachine, args?: { expression?: string }): Promise<InspectResult> {
  const r = await sm.undisplay(args?.expression);
  log({ cmd: 'undisplay', result: r });
  return r;
}

export async function cmdArgs(sm: DebugStateMachine): Promise<InspectResult> {
  const r = await sm.args();
  log({ cmd: 'args', result: r });
  return r;
}

export async function cmdRetval(sm: DebugStateMachine): Promise<InspectResult> {
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
