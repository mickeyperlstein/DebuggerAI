/**
 * extension.ts — composition root only.
 *
 * WHAT: Wires adapters → managers → server → commands. No business logic.
 * WHY:  All vscode coupling lives in src/adapters/VsCode*.ts and
 *       src/commands/VsCodeCommandRegistry.ts. This file is the only place
 *       that knows about the concrete classes; everything else depends on
 *       interfaces (IDebugAdapter, ISessionAdapter).
 * WHEN: Called by VS Code when the extension activates.
 */

import * as vscode from 'vscode';
import { BreakpointManager }       from './breakpoints';
import { SessionManager }          from './session';
import { Server }                  from './server';
import { VsCodeBreakpointAdapter } from './adapters/VsCodeBreakpointAdapter';
import { VsCodeDapProxy }          from './adapters/VsCodeDapProxy';
import { VsCodeSessionAdapter }    from './adapters/VsCodeSessionAdapter';
import { VsCodeCommandRegistry }   from './commands/VsCodeCommandRegistry';
import { log, dispose as disposeLog } from './log';

let server: Server | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const bpAdapter      = new VsCodeBreakpointAdapter();
  const dapProxy       = new VsCodeDapProxy(ctx);
  const sessionAdapter = new VsCodeSessionAdapter(dapProxy);

  const mgr = new BreakpointManager(bpAdapter);
  const sm  = new SessionManager(sessionAdapter);

  const port = vscode.workspace.getConfiguration('debuggingAI').get<number>('serverPort', 7890);
  server = new Server(mgr, sm, port);
  await server.start().catch(() => {
    void vscode.window.showWarningMessage(`DebuggingAI: port ${port} unavailable — CLI disabled`);
  });

  new VsCodeCommandRegistry(ctx, mgr, sm);

  log({ event: 'activated', name: 'debugai', port, version: '0.1.0' });
}

export async function deactivate(): Promise<void> {
  await server?.stop();
  disposeLog();
}
