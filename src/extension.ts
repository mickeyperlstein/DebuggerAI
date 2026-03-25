import * as vscode from 'vscode';
import { BreakpointManager } from './breakpoints';
import { IDebugAdapter } from './IDebugAdapter';
import { ISessionAdapter, StopEvent, ExecCmd } from './ISessionAdapter';
import { SessionManager } from './session';
import { Server } from './server';
import { cmdSet, cmdEdit, cmdList, cmdClear, cmdClearAll } from './commands';
import { cmdStart, cmdQuit, cmdRestart, cmdStatus,
         cmdContinue, cmdNext, cmdStep, cmdReturn, cmdUntil, cmdJump,
         cmdPrint, cmdPrettyPrint, cmdWhatis, cmdExec,
         cmdDisplay, cmdUndisplay, cmdArgs, cmdRetval } from './sessionCommands';
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
  // WHAT: Fires whenever the debugger pauses (breakpoint, step, entry, etc.).
  //       Execution commands await this bus to know when the next pause happens.
  // WHY:  We use VS Code's own debug API layer (onDidChangeActiveStackItem) rather
  //       than calling the raw DAP stackTrace request ourselves. This gives us the
  //       same frameId that VS Code's Debug Console and Watch panel use — making
  //       variable inspection work identically for all debugger backends (Python,
  //       Node, etc.) without any adapter-specific workarounds.
  // WHEN: Fires on every pause — after VS Code has processed the stopped event,
  //       assigned its internal frame IDs, and selected the top frame.
  const stoppedBus = new vscode.EventEmitter<StopEvent>();
  ctx.subscriptions.push(stoppedBus);

  // Capture the stop reason from the raw DAP event so we can attach it to the
  // stoppedBus event fired by onDidChangeActiveStackItem below.
  // WHY separate: onDidChangeActiveStackItem doesn't carry the stop reason.
  let pendingStopReason: StopReason | undefined;

  ctx.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', {
      createDebugAdapterTracker() {
        return {
          onDidSendMessage(msg: any) {
            if (msg.type === 'event' && msg.event === 'stopped') {
              pendingStopReason = (msg.body?.reason ?? 'pause') as StopReason;
            }
          },
        };
      },
    }),
  );

  // WHAT: Fires stoppedBus when VS Code selects a new stack frame after a pause.
  // WHY:  VS Code's activeStackItem.frameId is the authoritative frame ID — the
  //       same one used by the Debug Console and Watch panel. Using it here means
  //       our evaluate calls use the exact same frameId as VS Code's own UI, which
  //       works across all adapters without adapter-specific ID remapping.
  // WHEN: Triggered by VS Code after it processes a stopped event and calls
  //       stackTrace internally. Only fires stoppedBus if a stop event preceded it
  //       (pendingStopReason is set) to avoid reacting to user frame navigation.
  ctx.subscriptions.push(
    vscode.debug.onDidChangeActiveStackItem(async item => {
      if (!(item instanceof vscode.DebugStackFrame)) return;
      if (pendingStopReason === undefined) return;
      const reason = pendingStopReason;
      pendingStopReason = undefined;

      const session = vscode.debug.activeDebugSession;
      if (!session) return;
      try {
        // Fetch file/line for the stopped position. We use item.threadId (VS Code's
        // thread ID) so the stackTrace is consistent with VS Code's frame selection.
        const st = await Promise.resolve(session.customRequest('stackTrace', {
          threadId: item.threadId,
          startFrame: 0,
          levels: 1,
        }));
        const frame = st?.stackFrames?.[0];
        stoppedBus.fire({
          file:     frame?.source?.path ?? '',
          line:     frame?.line ?? 0,
          function: frame?.name,
          reason,
          frameId:  item.frameId,   // VS Code's internal frame ID — matches Debug Console
        });
      } catch {
        stoppedBus.fire({ file: '', line: 0, reason, frameId: item.frameId });
      }
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
          frameId: frame?.id,
        };
      } catch (e: any) {
        return { ok: false, error: `jump failed: ${e?.message ?? 'unknown error'}` };
      }
    },

    // ── Inspection (Sprint 4) ──────────────────────────────────────────────

    async evaluate(expression: string, frameId: number, context = 'repl') {
      // WHAT: Evaluate an expression in the context of the current paused frame.
      // WHY:  We ask VS Code "what frame is currently selected?" at call time via
      //       vscode.debug.activeStackItem. This is the exact frameId the Debug Console
      //       and Watch panel send to the underlying adapter — VS Code's internally-managed
      //       ID that it correctly proxies to any adapter (Python, Node, Go, Ruby, etc.).
      //       We do NOT use a cached frameId from a stop event because VS Code may not
      //       correctly round-trip IDs produced by our own stackTrace DAP request (this
      //       was the cause of Python NameErrors: our cached ID landed at module scope).
      // WHEN: Called for print, prettyPrint, whatis, exec, display commands while paused.
      const session = vscode.debug.activeDebugSession;
      if (!session) return { error: 'no active debug session' };

      // WHAT: Read VS Code's currently selected call-stack frame.
      // WHY:  vscode.debug.activeStackItem is VS Code's authoritative frame selection —
      //       the same object the Debug Console reads when you type an expression.
      //       Fallback to the cached frameId only if VS Code hasn't set an active frame yet.
      const activeItem = vscode.debug.activeStackItem;
      const effectiveFrameId = (activeItem instanceof vscode.DebugStackFrame)
        ? activeItem.frameId
        : frameId;

      // eslint-disable-next-line no-console
      console.error(`[DIAG] eval type=${session.type} activeItem=${activeItem?.constructor?.name} activeFrameId=${(activeItem as any)?.frameId} cached=${frameId} effective=${effectiveFrameId} expr=${expression}`);

      try {
        const r = await Promise.resolve(session.customRequest('evaluate', { expression, context, frameId: effectiveFrameId }));
        // eslint-disable-next-line no-console
        console.error(`[DIAG] ok result=${r?.result}`);
        return { result: r?.result ?? '', type: r?.type };
      } catch (e: any) {
        return { error: e?.message ?? 'evaluation failed' };
      }
    },

    async scopes(frameId: number) {
      // WHAT: Fetch variable scopes for the current frame.
      // WHY:  Same principle as evaluate — use VS Code's active frame ID so that
      //       scopes requests are consistent with what the Variables panel shows.
      const session = vscode.debug.activeDebugSession;
      if (!session) return { scopes: [] };
      const activeItem = vscode.debug.activeStackItem;
      const effectiveFrameId = (activeItem instanceof vscode.DebugStackFrame)
        ? activeItem.frameId
        : frameId;
      try {
        const r = await Promise.resolve(session.customRequest('scopes', { frameId: effectiveFrameId }));
        return { scopes: r?.scopes ?? [] };
      } catch {
        return { scopes: [] };
      }
    },

    async variables(variablesReference: number) {
      const session = vscode.debug.activeDebugSession;
      if (!session) return { variables: [] };
      try {
        const r = await Promise.resolve(session.customRequest('variables', { variablesReference }));
        return { variables: r?.variables ?? [] };
      } catch {
        return { variables: [] };
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

  // Sprint 4 — inspection
  reg('debuggingAI.print',       args => cmdPrint(sm, args));
  reg('debuggingAI.prettyPrint', args => cmdPrettyPrint(sm, args));
  reg('debuggingAI.whatis',      args => cmdWhatis(sm, args));
  reg('debuggingAI.exec',        args => cmdExec(sm, args));
  reg('debuggingAI.display',     args => cmdDisplay(sm, args));
  reg('debuggingAI.undisplay',   args => cmdUndisplay(sm, args));
  reg('debuggingAI.args',        ()   => cmdArgs(sm));
  reg('debuggingAI.retval',      ()   => cmdRetval(sm));

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
