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

import * as vscode from 'vscode';
import { VsCodeExtensionClient } from './client/VsCodeExtensionClient';
import { log, dispose as disposeLog } from './log';

let client: VsCodeExtensionClient | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const port = vscode.workspace.getConfiguration('debuggingAI').get<number>('serverPort', 7890);
  client = new VsCodeExtensionClient(ctx, port);
  client.connect();
  log({ event: 'activated', name: 'debugai', port, version: '0.1.0' });
}

export function deactivate(): void {
  disposeLog();
}
