/**
 * extension.ts — VS Code extension entry point.
 *
 * WHAT: Starts the VsCodeExtensionClient which connects to the standalone
 *       DebuggingAI server and registers this VS Code window as a debug client.
 * WHY:  The server is now a standalone process with no vscode dependency.
 *       The extension is a thin client that bridges VS Code's debug API to
 *       the server via WebSocket. Every vscode.debug.* call lives here;
 *       the server only speaks HTTP + WebSocket.
 * WHEN: Called by VS Code when the extension activates (onStartupFinished).
 */

import * as vscode   from 'vscode';
import * as path     from 'path';
import * as cp       from 'child_process';
import { VsCodeExtensionClient }    from './client/VsCodeExtensionClient';
import { VsCodeBreakpointAdapter }  from './adapters/VsCodeBreakpointAdapter';
import { VsCodeDapProxy }           from './adapters/VsCodeDapProxy';
import { VsCodeSessionAdapter }     from './adapters/VsCodeSessionAdapter';
import { BreakpointManager }        from './breakpoints';
import { SessionManager }           from './session';
import { VsCodeCommandRegistry }    from './commands/VsCodeCommandRegistry';
import { log, dispose as disposeLog } from './log';

let client:     VsCodeExtensionClient | undefined;
let serverProc: cp.ChildProcess      | undefined;

/**
 * WHAT: Start the standalone DebuggingAI server if it is not already running.
 * WHY:  The extension is a thin WebSocket client — it requires the server to
 *       be running before it can connect. Rather than asking the user to run
 *       `npm run server` manually, the extension auto-starts it on activation.
 * WHEN: Called once in activate(), before VsCodeExtensionClient.connect().
 */
function ensureServer(ctx: vscode.ExtensionContext, port: number): void {
  // WHAT: Probe the port first — if a server is already running (e.g. started
  //       by the test harness or the user manually), do not spawn a second one.
  // WHY:  Spawning two servers on the same port causes EADDRINUSE and prevents
  //       the extension from connecting at all.
  const http = require('http') as typeof import('http');
  const probe = http.get(`http://127.0.0.1:${port}/`, res => {
    res.resume();
    log({ event: 'server:already-running', port });
  });
  probe.on('error', () => {
    // Nothing listening — spawn the server.
    const serverJs = path.join(ctx.extensionPath, 'out', 'bin', 'server.js');
    serverProc = cp.spawn(process.execPath, [serverJs], {
      stdio: 'pipe',
      env: { ...process.env, DEBUGAI_PORT: String(port) },
      detached: false,
    });
    serverProc.stdout?.on('data', d => log({ event: 'server', msg: d.toString().trim() }));
    serverProc.stderr?.on('data', d => log({ event: 'server:err', msg: d.toString().trim() }));
    serverProc.on('exit', code => log({ event: 'server:exit', code }));
    ctx.subscriptions.push({ dispose: () => serverProc?.kill() });
  });
  probe.end();
}

export function activate(ctx: vscode.ExtensionContext): void {
  const port = vscode.workspace.getConfiguration('debuggingAI').get<number>('serverPort', 7890);

  // Start server if not already running
  ensureServer(ctx, port);

  // Compose VS Code adapters and managers
  const bpAdapter     = new VsCodeBreakpointAdapter();
  const dapProxy      = new VsCodeDapProxy(ctx);
  const sessionAdapter = new VsCodeSessionAdapter(dapProxy);
  const mgr           = new BreakpointManager(bpAdapter);
  const sm            = new SessionManager(sessionAdapter);

  // Register VS Code command palette commands
  new VsCodeCommandRegistry(ctx, mgr, sm);

  // Connect to the bus as a WebSocket client
  client = new VsCodeExtensionClient(ctx, port);
  client.connect();

  log({ event: 'activated', name: 'debugai', port, version: '0.1.0' });
}

export function deactivate(): void {
  disposeLog();
}
