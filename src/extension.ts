import * as vscode from 'vscode';
import { BreakpointManager } from './breakpoints';
import { IDebugAdapter } from './IDebugAdapter';
import { ISessionAdapter, StopEvent, ExecCmd } from './ISessionAdapter';
import { SessionManager } from './session';
import { Server } from './server';
import { cmdSet, cmdEdit, cmdList, cmdClear, cmdClearAll } from './commands';
import { cmdStart, cmdQuit, cmdRestart, cmdStatus,
         cmdContinue, cmdNext, cmdStep, cmdReturn, cmdUntil, cmdJump } from './sessionCommands';
import { log, dispose as disposeLog } from './log';
import { StopReason } from './interfaces/IDebugger';

/**
 * Composition root — wires vscode.debug into IDebugAdapter,
 * builds the manager, starts the server, registers commands.
 */

// Real adapter: thin wrapper so BreakpointManager never imports vscode.
const vsCodeAdapter: IDebugAdapter = {
  addBreakpoint(file, line, condition, enabled = true) {
    const loc = new vscode.Location(vscode.Uri.file(file), new vscode.Position(line - 1, 0));
    vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(loc, enabled, condition)]);
  },
  removeBreakpoint(file, line) {
    const match = vscode.debug.breakpoints.find(
      b => b instanceof vscode.SourceBreakpoint
        && b.location.uri.fsPath === file
        && b.location.range.start.line === line - 1,
    ) as vscode.SourceBreakpoint | undefined;
    if (match) vscode.debug.removeBreakpoints([match]);
  },
};

let server: Server | undefined;

export async function activate(ctx: vscode.ExtensionContext) {
  // ── Stopped-event bus ────────────────────────────────────────────────────
  // The DebugAdapterTracker below intercepts every DAP 'stopped' event and
  // fires this bus. Execution commands subscribe to it to await the next stop.
  const stoppedBus = new vscode.EventEmitter<StopEvent>();
  ctx.subscriptions.push(stoppedBus);

  ctx.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        return {
          onDidSendMessage(msg: any) {
            if (msg.type === 'event' && msg.event === 'stopped') {
              Promise.resolve(session.customRequest('stackTrace', {
                threadId: msg.body?.threadId ?? 1,
                startFrame: 0,
                levels: 1,
              }))
                .then((r: any) => {
                  const frame = r?.stackFrames?.[0];
                  stoppedBus.fire({
                    file: frame?.source?.path ?? '',
                    line: frame?.line ?? 0,
                    function: frame?.name,
                    reason: (msg.body?.reason ?? 'pause') as StopReason,
                  });
                })
                .catch(() => {
                  stoppedBus.fire({ file: '', line: 0, reason: (msg.body?.reason ?? 'pause') as StopReason });
                });
            }
          },
        };
      },
    }),
  );

  // Returns the next stopped position (or null on session exit / timeout).
  function waitForStop(timeoutMs = 15_000): Promise<StopEvent | null> {
    return new Promise(resolve => {
      const t = setTimeout(() => { stoppedSub.dispose(); termSub.dispose(); resolve(null); }, timeoutMs);
      const termSub = vscode.debug.onDidTerminateDebugSession(() => {
        clearTimeout(t); stoppedSub.dispose(); termSub.dispose();
        resolve({ file: '', line: 0, reason: 'exited' });
      });
      const stoppedSub = stoppedBus.event(ev => {
        clearTimeout(t); stoppedSub.dispose(); termSub.dispose();
        resolve(ev);
      });
    });
  }

  // ── Real session adapter ─────────────────────────────────────────────────
  const vsCodeSessionAdapter: ISessionAdapter = {
    async startDebugging(configName: string): Promise<StopEvent | null> {
      const folder = vscode.workspace.workspaceFolders?.[0];
      const configs = vscode.workspace.getConfiguration('launch', folder).get<any[]>('configurations', []);
      if (!configs.some((c: any) => c.name === configName)) return null;

      return new Promise<StopEvent | null>(resolve => {
        const t = setTimeout(() => { startSub.dispose(); termSub.dispose(); resolve(null); }, 15_000);

        const termSub = vscode.debug.onDidTerminateDebugSession(() => {
          clearTimeout(t); startSub.dispose(); termSub.dispose(); resolve(null);
        });

        const startSub = vscode.debug.onDidStartDebugSession(() => {
          startSub.dispose();
          // Wait for the stopped event (stopOnEntry) — more reliable than a fixed timer.
          waitForStop(10_000).then(ev => {
            clearTimeout(t); termSub.dispose();
            resolve(ev ?? { file: '', line: 0, reason: 'entry' });
          });
        });

        Promise.resolve(vscode.debug.startDebugging(folder, configName))
          .then(ok => {
            if (!ok) { clearTimeout(t); startSub.dispose(); termSub.dispose(); resolve(null); }
          });
      });
    },

    async stopDebugging(): Promise<void> {
      await vscode.debug.stopDebugging();
    },

    async restartDebugging(): Promise<StopEvent> {
      return new Promise<StopEvent>(resolve => {
        const sub = vscode.debug.onDidStartDebugSession(() => {
          sub.dispose();
          waitForStop(10_000).then(ev => {
            resolve(ev ?? { file: '', line: 0, reason: 'entry' });
          });
        });
        vscode.commands.executeCommand('workbench.action.debug.restart');
        setTimeout(() => { sub.dispose(); resolve({ file: '', line: 0, reason: 'entry' }); }, 15_000);
      });
    },

    // ── Execution (Sprint 3) ───────────────────────────────────────────────

    async sendExecution(cmd: ExecCmd): Promise<StopEvent | null> {
      const session = vscode.debug.activeDebugSession;
      if (!session) return null;
      const dapCmd = { continue: 'continue', next: 'next', stepIn: 'stepIn', stepOut: 'stepOut' }[cmd];
      // Register listener BEFORE sending the request to avoid race conditions.
      const stopPromise = waitForStop(15_000);
      await Promise.resolve(session.customRequest(dapCmd, { threadId: 1 })).catch(() => {});
      const ev = await stopPromise;
      return ev?.reason === 'exited' ? null : ev;
    },

    async sendUntil(file: string, line: number): Promise<StopEvent | null> {
      const session = vscode.debug.activeDebugSession;
      if (!session) return null;
      const loc = new vscode.Location(vscode.Uri.file(file), new vscode.Position(line - 1, 0));
      const tempBp = new vscode.SourceBreakpoint(loc, true);
      vscode.debug.addBreakpoints([tempBp]);
      try {
        const stopPromise = waitForStop(15_000);
        await Promise.resolve(session.customRequest('continue', { threadId: 1 })).catch(() => {});
        const ev = await stopPromise;
        return ev?.reason === 'exited' ? null : ev;
      } finally {
        vscode.debug.removeBreakpoints([tempBp]);
      }
    },

    async sendJump(file: string, line: number): Promise<StopEvent | { ok: false; error: string }> {
      const session = vscode.debug.activeDebugSession;
      if (!session) return { ok: false, error: 'no active debug session' };
      try {
        const targetsResp = await session.customRequest('gotoTargets', {
          source: { path: file },
          line,
        });
        const targets: any[] = targetsResp?.targets ?? [];
        if (!targets.length) {
          return { ok: false, error: 'jump not allowed: no valid goto targets at this line' };
        }
        await session.customRequest('goto', { threadId: 1, targetId: targets[0].id });
        // goto does not emit a stopped event — fetch position directly.
        const r = await session.customRequest('stackTrace', { threadId: 1, startFrame: 0, levels: 1 });
        const frame = r?.stackFrames?.[0];
        return {
          file: frame?.source?.path ?? file,
          line: frame?.line ?? line,
          function: frame?.name,
          reason: 'goto',
        };
      } catch (e: any) {
        return { ok: false, error: `jump failed: ${e?.message ?? 'unknown error'}` };
      }
    },
  };

  // ── Wire up managers ─────────────────────────────────────────────────────
  const mgr = new BreakpointManager(vsCodeAdapter);
  const sm  = new SessionManager(vsCodeSessionAdapter);
  const port = vscode.workspace.getConfiguration('debuggingAI').get<number>('serverPort', 7890);

  server = new Server(mgr, sm, port);
  await server.start().catch(() => {
    void vscode.window.showWarningMessage(`DebuggingAI: port ${port} unavailable — CLI disabled`);
  });

  const reg = (id: string, fn: (...a: any[]) => any) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // Sprint 1 — breakpoints
  reg('debuggingAI.setBreakpoint',      args => cmdSet(mgr, args));
  reg('debuggingAI.editBreakpoint',     args => cmdEdit(mgr, args));
  reg('debuggingAI.listBreakpoints',    ()   => cmdList(mgr));
  reg('debuggingAI.clearBreakpoint',    args => cmdClear(mgr, args));
  reg('debuggingAI.clearAllBreakpoints', ()  => cmdClearAll(mgr));

  // Sprint 2 — session lifecycle
  reg('debuggingAI.start',   args => cmdStart(sm, args));
  reg('debuggingAI.quit',    ()   => cmdQuit(sm));
  reg('debuggingAI.restart', args => cmdRestart(sm, args));
  reg('debuggingAI.status',  ()   => cmdStatus(sm));

  // Sprint 3 — execution control
  reg('debuggingAI.continue', ()   => cmdContinue(sm));
  reg('debuggingAI.next',     ()   => cmdNext(sm));
  reg('debuggingAI.step',     ()   => cmdStep(sm));
  reg('debuggingAI.return',   ()   => cmdReturn(sm));
  reg('debuggingAI.until',    args => cmdUntil(sm, args));
  reg('debuggingAI.jump',     args => cmdJump(sm, args));

  ctx.subscriptions.push(
    vscode.debug.onDidChangeBreakpoints(({ added, removed, changed }) => {
      added.filter(b => b instanceof vscode.SourceBreakpoint).forEach(b => {
        const s = b as vscode.SourceBreakpoint;
        mgr.syncExternal('added', s.location.uri.fsPath, s.location.range.start.line + 1, s.condition ?? null, s.enabled);
      });
      removed.filter(b => b instanceof vscode.SourceBreakpoint).forEach(b => {
        const s = b as vscode.SourceBreakpoint;
        mgr.syncExternal('removed', s.location.uri.fsPath, s.location.range.start.line + 1, null, false);
      });
      changed.filter(b => b instanceof vscode.SourceBreakpoint).forEach(b => {
        const s = b as vscode.SourceBreakpoint;
        mgr.syncExternal('changed', s.location.uri.fsPath, s.location.range.start.line + 1, s.condition ?? null, s.enabled);
      });
    }),
  );

  log({ event: 'activated', name: 'debugai', port, version: '0.1.0' });
}

export async function deactivate() {
  await server?.stop();
  disposeLog();
}
