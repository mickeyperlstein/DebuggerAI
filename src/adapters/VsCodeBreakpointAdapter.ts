/**
 * VsCodeBreakpointAdapter — IDebugAdapter implementation.
 *
 * WHAT: Bridges BreakpointManager to VS Code's breakpoint UI (gutter icons,
 *       breakpoints panel).
 * WHY:  BreakpointManager must never import vscode — this thin adapter keeps
 *       the core breakpoint logic IDE-agnostic.
 * WHEN: Instantiated once in extension.ts and injected into BreakpointManager.
 */

import * as vscode from 'vscode';
import { IDebugAdapter } from '../IDebugAdapter';

export class VsCodeBreakpointAdapter implements IDebugAdapter {
  addBreakpoint(file: string, line: number, condition?: string, enabled = true): void {
    const loc = new vscode.Location(
      vscode.Uri.file(file),
      new vscode.Position(line - 1, 0),
    );
    vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(loc, enabled, condition)]);
  }

  removeBreakpoint(file: string, line: number): void {
    const match = vscode.debug.breakpoints.find(
      b =>
        b instanceof vscode.SourceBreakpoint &&
        b.location.uri.fsPath === file &&
        b.location.range.start.line === line - 1,
    ) as vscode.SourceBreakpoint | undefined;
    if (match) {
      vscode.debug.removeBreakpoints([match]);
    }
  }
}
