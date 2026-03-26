/**
 * VsCodeSessionAdapter — ISessionAdapter implementation for VS Code.
 *
 * WHAT: Translates ISessionAdapter calls into vscode.debug API calls.
 *       Uses VsCodeDapProxy for stopped-event plumbing.
 *       Uses LanguageStrategy.resolveFrameId to get the correct frameId per language.
 *
 * WHY separate from extension.ts:
 *   Single Responsibility — this class has exactly one reason to change:
 *   how VS Code's debug API is used. Command registration, server wiring,
 *   and breakpoint sync all live in separate files.
 *
 * WHY LanguageStrategy:
 *   Each debug adapter has quirks. Python/debugpy requires the raw id(frame)
 *   address from a fresh stackTrace call; pwa-node works with the cached ID.
 *   Strategy pattern isolates each language's quirk without conditionals here.
 *
 * WHEN: Constructed once in extension.ts, injected into SessionManager.
 *
 * Only VsCode*.ts adapter files may import vscode.
 */

import * as vscode from 'vscode';
import { ISessionAdapter, StopEvent, EvalResult } from '../ISessionAdapter';
import { VsCodeDapProxy }    from './VsCodeDapProxy';
import { LanguageStrategy }  from '../strategies/LanguageStrategy';
import { NodeStrategy }      from '../strategies/NodeStrategy';
import { PythonStrategy }    from '../strategies/PythonStrategy';

const SESSION_START_TIMEOUT_MS   = 15_000;
const SESSION_RESTART_TIMEOUT_MS = 15_000;
const STOP_WAIT_TIMEOUT_MS       = 10_000;

/**
 * Registry of language strategies keyed by VS Code session type.
 * Extend here when adding Go, Ruby, Dart, etc. — no other file changes needed.
 */
const STRATEGY_REGISTRY: Record<string, LanguageStrategy> = {
  'pwa-node': new NodeStrategy(),
  'node':     new NodeStrategy(),
  'node2':    new NodeStrategy(),
  'python':   new PythonStrategy(),
  'debugpy':  new PythonStrategy(),
};

const DEFAULT_STRATEGY: LanguageStrategy = new NodeStrategy();

function strategyFor(sessionType: string): LanguageStrategy {
  return STRATEGY_REGISTRY[sessionType] ?? DEFAULT_STRATEGY;
}

export class VsCodeSessionAdapter implements ISessionAdapter {
  constructor(private readonly proxy: VsCodeDapProxy) {}

  async startDebugging(configName: string): Promise<StopEvent | null> {
    const folder  = vscode.workspace.workspaceFolders?.[0];
    const configs = vscode.workspace.getConfiguration('launch', folder).get<any[]>('configurations', []);
    if (!configs.some((c: any) => c.name === configName)) return null;

    return new Promise<StopEvent | null>(resolve => {
      const timer = setTimeout(() => {
        startSub.dispose();
        termSub.dispose();
        resolve(null);
      }, SESSION_START_TIMEOUT_MS);

      const termSub = vscode.debug.onDidTerminateDebugSession(() => {
        clearTimeout(timer);
        startSub.dispose();
        termSub.dispose();
        resolve(null);
      });

      const startSub = vscode.debug.onDidStartDebugSession(() => {
        startSub.dispose();
        // Wait for the stopped event (stopOnEntry) rather than using a fixed timer.
        this.proxy.waitForStop(STOP_WAIT_TIMEOUT_MS).then(ev => {
          clearTimeout(timer);
          termSub.dispose();
          resolve(ev ?? { file: '', line: 0, reason: 'entry' });
        });
      });

      Promise.resolve(vscode.debug.startDebugging(folder, configName)).then(ok => {
        if (!ok) {
          clearTimeout(timer);
          startSub.dispose();
          termSub.dispose();
          resolve(null);
        }
      });
    });
  }

  async stopDebugging(): Promise<void> {
    await vscode.debug.stopDebugging();
  }

  async restartDebugging(): Promise<StopEvent> {
    return new Promise<StopEvent>(resolve => {
      const sub = vscode.debug.onDidStartDebugSession(() => {
        sub.dispose();
        this.proxy.waitForStop(STOP_WAIT_TIMEOUT_MS).then(ev => {
          resolve(ev ?? { file: '', line: 0, reason: 'entry' });
        });
      });
      vscode.commands.executeCommand('workbench.action.debug.restart');
      setTimeout(() => {
        sub.dispose();
        resolve({ file: '', line: 0, reason: 'entry' });
      }, SESSION_RESTART_TIMEOUT_MS);
    });
  }

  async sendExecution(cmd: 'continue' | 'next' | 'stepIn' | 'stepOut'): Promise<StopEvent | null> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return null;
    // Register listener BEFORE sending the request to avoid race conditions.
    const stopPromise = this.proxy.waitForStop();
    await Promise.resolve(session.customRequest(cmd, { threadId: 1 })).catch(() => {});
    const ev = await stopPromise;
    return ev?.reason === 'exited' ? null : ev;
  }

  async sendUntil(file: string, line: number): Promise<StopEvent | null> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return null;
    const loc    = new vscode.Location(vscode.Uri.file(file), new vscode.Position(line - 1, 0));
    const tempBp = new vscode.SourceBreakpoint(loc, true);
    vscode.debug.addBreakpoints([tempBp]);
    try {
      const stopPromise = this.proxy.waitForStop();
      await Promise.resolve(session.customRequest('continue', { threadId: 1 })).catch(() => {});
      const ev = await stopPromise;
      return ev?.reason === 'exited' ? null : ev;
    } finally {
      vscode.debug.removeBreakpoints([tempBp]);
    }
  }

  async sendJump(file: string, line: number): Promise<StopEvent | { ok: false; error: string }> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return { error: 'no active debug session', ok: false };
    try {
      const targetsResp = await session.customRequest('gotoTargets', {
        source: { path: file },
        line,
      });
      const targets: any[] = targetsResp?.targets ?? [];
      if (!targets.length) {
        return { error: 'jump not allowed: no valid goto targets at this line', ok: false };
      }
      await session.customRequest('goto', { threadId: 1, targetId: targets[0].id });
      // goto does not emit a stopped event — fetch position directly.
      const r = await session.customRequest('stackTrace', { threadId: 1, startFrame: 0, levels: 1 });
      const frame = r?.stackFrames?.[0];
      return {
        file:     frame?.source?.path ?? file,
        line:     frame?.line ?? line,
        function: frame?.name,
        reason:   'goto',
        frameId:  frame?.id,
      };
    } catch (e: any) {
      return { error: `jump failed: ${e?.message ?? 'unknown error'}`, ok: false };
    }
  }

  async evaluate(expression: string, frameId: number, context = 'repl'): Promise<EvalResult> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return { error: 'no active debug session' };
    const effectiveFrameId = await this.resolveFrameId(session, frameId);
    try {
      const r = await Promise.resolve(
        session.customRequest('evaluate', { expression, context, frameId: effectiveFrameId }),
      );
      return { result: r?.result ?? '', type: r?.type };
    } catch (e: any) {
      return { error: e?.message ?? 'evaluation failed' };
    }
  }

  async scopes(frameId: number): Promise<{ scopes: any[] }> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return { scopes: [] };
    const effectiveFrameId = await this.resolveFrameId(session, frameId);
    try {
      const r = await Promise.resolve(session.customRequest('scopes', { frameId: effectiveFrameId }));
      return { scopes: r?.scopes ?? [] };
    } catch {
      return { scopes: [] };
    }
  }

  async variables(variablesReference: number): Promise<{ variables: any[] }> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return { variables: [] };
    try {
      const r = await Promise.resolve(session.customRequest('variables', { variablesReference }));
      return { variables: r?.variables ?? [] };
    } catch {
      return { variables: [] };
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Delegates frameId resolution to the language strategy.
   * This is where Python gets its fresh raw frame ID from debugpy,
   * and Node just gets the cached ID back unchanged.
   */
  private async resolveFrameId(session: any, cachedFrameId: number): Promise<number | undefined> {
    return strategyFor(session.type ?? '').resolveFrameId(session, {
      hasVsCodeProxy: true,
      threadId:       this.proxy.activeThreadId,
      rawTopFrameId:  this.proxy.rawTopFrameId,
      cachedFrameId,
    });
  }
}
