/**
 * VsCodeCommandRegistry — registers all VS Code commands.
 *
 * WHAT: Calls ctx.subscriptions.push(registerCommand(...)) for every
 *       debuggingAI.* command and wires the breakpoint-sync listener.
 * WHY:  Single Responsibility — this class has exactly one reason to change:
 *       which commands the extension exposes. No business logic lives here;
 *       everything delegates to command functions in commands.ts / sessionCommands.ts.
 * WHEN: Instantiated once in extension.ts after managers are constructed.
 */

import * as vscode from 'vscode';
import { BreakpointManager } from '../breakpoints';
import { SessionManager }    from '../session';

import { cmdSet, cmdEdit, cmdList, cmdClear, cmdClearAll } from '../commands';
import {
  cmdStart, cmdQuit, cmdRestart, cmdStatus,
  cmdContinue, cmdNext, cmdStep, cmdReturn, cmdUntil, cmdJump,
  cmdPrint, cmdPrettyPrint, cmdWhatis, cmdExec,
  cmdDisplay, cmdUndisplay, cmdArgs, cmdRetval,
} from '../sessionCommands';

export class VsCodeCommandRegistry {
  constructor(
    ctx: vscode.ExtensionContext,
    mgr: BreakpointManager,
    sm:  SessionManager,
  ) {
    const reg = (id: string, fn: (...a: any[]) => any) =>
      ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

    // Sprint 1 — breakpoints
    reg('debuggingAI.setBreakpoint',       args => cmdSet(mgr, args));
    reg('debuggingAI.editBreakpoint',      args => cmdEdit(mgr, args));
    reg('debuggingAI.listBreakpoints',     ()   => cmdList(mgr));
    reg('debuggingAI.clearBreakpoint',     args => cmdClear(mgr, args));
    reg('debuggingAI.clearAllBreakpoints', ()   => cmdClearAll(mgr));

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

    // Keep BreakpointManager in sync when the user adds/removes/edits
    // breakpoints directly via the editor gutter or breakpoints panel.
    ctx.subscriptions.push(
      vscode.debug.onDidChangeBreakpoints(({ added, removed, changed }) => {
        added.filter(b => b instanceof vscode.SourceBreakpoint).forEach(b => {
          const s = b as vscode.SourceBreakpoint;
          mgr.syncExternal('added', s.location.uri.fsPath, s.location.range.start.line + 1, s.condition ?? null, s.enabled ?? true);
        });
        removed.filter(b => b instanceof vscode.SourceBreakpoint).forEach(b => {
          const s = b as vscode.SourceBreakpoint;
          mgr.syncExternal('removed', s.location.uri.fsPath, s.location.range.start.line + 1, null, false);
        });
        changed.filter(b => b instanceof vscode.SourceBreakpoint).forEach(b => {
          const s = b as vscode.SourceBreakpoint;
          mgr.syncExternal('changed', s.location.uri.fsPath, s.location.range.start.line + 1, s.condition ?? null, s.enabled ?? true);
        });
      }),
    );
  }
}
