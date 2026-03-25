/**
 * VsCodeDapProxy — stopped-event bus and DAP tracker.
 *
 * WHAT: Owns the single responsibility of converting raw VS Code debug events
 *       into a normalised StopEvent stream (stoppedBus) and exposing waitForStop().
 *
 * WHY two-step approach (DAP tracker + onDidChangeActiveStackItem):
 *   The raw DAP stopped event carries the stop reason (breakpoint/step/entry)
 *   but NOT a reliable frame ID. onDidChangeActiveStackItem fires AFTER VS Code
 *   has processed the stopped event, issued stackTrace internally, and selected
 *   the top frame — at that point item.threadId is available so strategies can
 *   issue their own fresh stackTrace. The two events are bridged via
 *   pendingStopReason.
 *
 * WHY threadId on stoppedBus / activeThreadId getter:
 *   PythonStrategy needs the threadId to issue a fresh customRequest('stackTrace')
 *   immediately before each evaluate call. This gives it the raw debugpy frame ID
 *   (id(frame) memory address) rather than VS Code's remapped sequential ID.
 *
 * WHEN: Constructed once in extension.ts, injected into VsCodeSessionAdapter.
 */

import * as vscode from 'vscode';
import { StopEvent } from '../ISessionAdapter';
import { StopReason } from '../interfaces/IDebugger';

const STOP_WAIT_TIMEOUT_MS = 15_000;
const STACK_TRACE_LEVELS   = 1;

export class VsCodeDapProxy {
  private readonly stoppedBus = new vscode.EventEmitter<StopEvent>();
  private pendingStopReason: StopReason | undefined;
  private lastThreadId: number | undefined;
  /**
   * The raw adapter frame ID from the most recent stackTrace RESPONSE,
   * captured BEFORE VS Code translates adapter IDs to its internal sequential IDs.
   *
   * WHY: VS Code's customRequest proxy remaps adapter frame IDs in responses
   *      (e.g., debugpy's id(frame)=4302698784 → 3) but does NOT remap back
   *      for evaluate requests. Intercepting the raw response lets PythonStrategy
   *      return the ID debugpy actually needs.
   */
  private lastRawFrameId: number | undefined;

  constructor(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(this.stoppedBus);
    this.registerDapTracker(ctx);
    this.registerStackItemListener(ctx);
  }

  /** Subscribe to stopped events. */
  get onStop(): vscode.Event<StopEvent> {
    return this.stoppedBus.event;
  }

  /**
   * The threadId from the most recent stop event.
   * VsCodeSessionAdapter passes this to strategies via FrameContext.
   */
  get activeThreadId(): number | undefined {
    return this.lastThreadId;
  }

  /**
   * The raw adapter frame ID from the most recent stackTrace response,
   * captured before VS Code's ID translation. PythonStrategy uses this
   * to send the correct frame ID to debugpy in evaluate requests.
   */
  get rawTopFrameId(): number | undefined {
    return this.lastRawFrameId;
  }

  /**
   * Returns the next stopped position, or null on session exit or timeout.
   *
   * WHEN: Register BEFORE sending the step/continue command to avoid the race
   *       where the stopped event arrives before the listener is set up.
   */
  waitForStop(timeoutMs = STOP_WAIT_TIMEOUT_MS): Promise<StopEvent | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        stoppedSub.dispose();
        termSub.dispose();
        resolve(null);
      }, timeoutMs);

      const termSub = vscode.debug.onDidTerminateDebugSession(() => {
        clearTimeout(timer);
        stoppedSub.dispose();
        termSub.dispose();
        resolve({ file: '', line: 0, reason: 'exited' });
      });

      const stoppedSub = this.stoppedBus.event(ev => {
        clearTimeout(timer);
        stoppedSub.dispose();
        termSub.dispose();
        resolve(ev);
      });
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Captures the raw DAP stop reason before VS Code processes the event.
   * onDidChangeActiveStackItem does not carry the stop reason, so we hold it
   * here until the stack item update fires.
   */
  private registerDapTracker(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      vscode.debug.registerDebugAdapterTrackerFactory('*', {
        createDebugAdapterTracker: () => ({
          onDidSendMessage: (msg: any) => {
            // Capture the stop reason from the raw DAP stopped event.
            if (msg.type === 'event' && msg.event === 'stopped') {
              this.pendingStopReason = (msg.body?.reason ?? 'pause') as StopReason;
            }

            // WHAT: Capture the raw frame ID from stackTrace responses BEFORE
            //       VS Code translates adapter IDs to its internal sequential IDs.
            // WHY:  VS Code remaps adapter frame IDs in responses (debugpy's
            //       id(frame) memory address → small sequential number) but does
            //       NOT remap them back when proxying evaluate requests from
            //       extensions. PythonStrategy uses this raw ID to send the correct
            //       frameId to debugpy so it evaluates in the correct scope.
            // WHEN: Fires for every message the debug adapter sends to VS Code,
            //       including stackTrace responses triggered by VS Code's own UI.
            if (msg.type === 'response' && msg.command === 'stackTrace') {
              const rawId: number | undefined = msg.body?.stackFrames?.[0]?.id;
              if (rawId !== undefined) {
                this.lastRawFrameId = rawId;
              }
            }
          },
        }),
      }),
    );
  }

  /**
   * Fires stoppedBus after VS Code finishes processing the stopped event.
   * Only fires when pendingStopReason is set (i.e., a real DAP stop preceded
   * this) to ignore user frame-navigation clicks in the Call Stack panel.
   */
  private registerStackItemListener(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      vscode.debug.onDidChangeActiveStackItem(async item => {
        if (!(item instanceof vscode.DebugStackFrame)) return;
        if (this.pendingStopReason === undefined) return;

        const reason = this.pendingStopReason;
        this.pendingStopReason = undefined;
        this.lastThreadId = item.threadId;

        const session = vscode.debug.activeDebugSession;
        if (!session) return;

        try {
          const st = await Promise.resolve(
            session.customRequest('stackTrace', {
              threadId: item.threadId,
              startFrame: 0,
              levels: STACK_TRACE_LEVELS,
            }),
          );
          const frame = st?.stackFrames?.[0];
          this.stoppedBus.fire({
            file:     frame?.source?.path ?? '',
            line:     frame?.line ?? 0,
            function: frame?.name,
            reason,
            frameId:  item.frameId,
            threadId: item.threadId,
          });
        } catch {
          this.stoppedBus.fire({
            file: '', line: 0, reason,
            frameId:  item.frameId,
            threadId: item.threadId,
          });
        }
      }),
    );
  }
}
