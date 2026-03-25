/**
 * VsCodeExtensionClient — thin VS Code client that connects to the standalone server.
 *
 * WHAT: Runs inside the VS Code extension host. Connects to the DebuggingAI
 *       server via WebSocket, receives commands, executes them using vscode.debug.*,
 *       and streams debug events (stopped, exited) back proactively.
 *
 * WHY:  The server is now standalone — it has no vscode imports. This client
 *       is the only place that touches VS Code's debug API. Every language
 *       adapter (Python, Node, Go) is handled transparently because we delegate
 *       to VS Code's built-in mechanisms, not to adapter-specific DAP calls.
 *
 * WHEN: Created once in extension.ts activate(). Connects immediately and
 *       reconnects automatically if the server restarts.
 */

import * as vscode     from 'vscode';
import { WsReconnector }  from './WsReconnector';
import { VsCodeDapProxy } from '../adapters/VsCodeDapProxy';
import { VsCodeSessionAdapter } from '../adapters/VsCodeSessionAdapter';
import { VsCodeBreakpointAdapter } from '../adapters/VsCodeBreakpointAdapter';
import {
  WsCommand, WsServerMessage, WsOkResponse, WsErrResponse,
  WsStoppedEvent, WsRegister,
} from '../server/ws-protocol';

const VERSION = '0.1.0';

export class VsCodeExtensionClient {
  private readonly ws:             WsReconnector;
  private readonly proxy:          VsCodeDapProxy;
  private readonly sessionAdapter: VsCodeSessionAdapter;
  private readonly bpAdapter:      VsCodeBreakpointAdapter;

  constructor(
    private readonly ctx:  vscode.ExtensionContext,
    private readonly port: number,
  ) {
    this.proxy          = new VsCodeDapProxy(ctx);
    this.sessionAdapter = new VsCodeSessionAdapter(this.proxy);
    this.bpAdapter      = new VsCodeBreakpointAdapter();
    this.ws             = new WsReconnector(`ws://127.0.0.1:${port}/__ws`);
  }

  connect(): void {
    // Register once on open: send identity + wire proactive event stream.
    this.ws.onOpen(() => {
      this.send<WsRegister>({ kind: 'register', version: VERSION });
      this.streamDebugEvents();
    });

    // Dispatch inbound commands to vscode.debug.*
    this.ws.onMessage((msg: WsServerMessage) => {
      this.dispatch(msg).catch(() => { /* errors sent as WsErrResponse */ });
    });

    this.ws.connect();
    this.ctx.subscriptions.push({ dispose: () => this.ws.close() });
  }

  // ── Proactive event streaming ─────────────────────────────────────────────

  /**
   * WHAT: Push stopped/exited events to the server without waiting for a command.
   * WHY:  The server's ClientAdapter awaits the WsResponse for long-running
   *       commands (startDebugging, sendExecution). The response IS the stop event,
   *       so for those commands the event is embedded in the response. But the
   *       server also needs to know about unsolicited stops and session exits
   *       independently of any in-flight command.
   */
  private streamDebugEvents(): void {
    // Forward every stop from VsCodeDapProxy to the server
    this.ctx.subscriptions.push(
      this.proxy.onStop(ev => {
        this.send<WsStoppedEvent>({
          kind: 'event',
          type: ev.reason === 'exited' ? 'exited' : 'stopped',
          payload: ev,
        });
      }),
    );
  }

  // ── Command dispatch ──────────────────────────────────────────────────────

  private async dispatch(cmd: WsCommand): Promise<void> {
    const { requestId } = cmd;
    try {
      const payload = await this.execute(cmd);
      this.send<WsOkResponse>({ kind: 'response', requestId, ok: true, payload });
    } catch (e: any) {
      this.send<WsErrResponse>({
        kind: 'response', requestId, ok: false,
        error: e?.message ?? 'unknown error',
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async execute(cmd: WsCommand): Promise<any> {
    switch (cmd.type) {
      // Session lifecycle
      case 'startDebugging':   return this.sessionAdapter.startDebugging(cmd.configName);
      case 'stopDebugging':    return this.sessionAdapter.stopDebugging();
      case 'restartDebugging': return this.sessionAdapter.restartDebugging();
      // Execution control
      case 'sendExecution':    return this.sessionAdapter.sendExecution(cmd.cmd);
      case 'sendUntil':        return this.sessionAdapter.sendUntil(cmd.file, cmd.line);
      case 'sendJump':         return this.sessionAdapter.sendJump(cmd.file, cmd.line);
      // Inspection
      case 'evaluate':         return this.sessionAdapter.evaluate(cmd.expression, cmd.frameId, cmd.context);
      case 'scopes':           return this.sessionAdapter.scopes(cmd.frameId);
      case 'variables':        return this.sessionAdapter.variables(cmd.variablesReference);
      // Breakpoints
      case 'addBreakpoint':    this.bpAdapter.addBreakpoint(cmd.file, cmd.line, cmd.condition, cmd.enabled); return;
      case 'removeBreakpoint': this.bpAdapter.removeBreakpoint(cmd.file, cmd.line); return;
      default: throw new Error(`unknown command: ${(cmd as WsCommand & { type: string }).type}`);
    }
  }

  private send<T extends object>(msg: T): void {
    this.ws.send(msg);
  }
}
