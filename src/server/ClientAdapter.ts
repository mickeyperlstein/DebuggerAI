/**
 * ClientAdapter — implements ISessionAdapter + IDebugAdapter via WebSocket RPC.
 *
 * WHAT: Converts every interface method call into a WsCommand sent to the
 *       connected VS Code extension client, and awaits the WsResponse.
 * WHY:  SessionManager and BreakpointManager depend only on ISessionAdapter and
 *       IDebugAdapter. By implementing both here, the standalone server has zero
 *       vscode imports — all VS Code coupling lives in the extension client.
 * WHEN: One instance lives for the lifetime of the server process. The same
 *       instance is reused across client reconnections.
 */

import * as crypto from 'crypto';
import { ISessionAdapter, StopEvent, EvalResult } from '../ISessionAdapter';
import { IDebugAdapter }    from '../IDebugAdapter';
import { ClientRegistry }   from './ClientRegistry';
import {
  WsCommand, WsClientMessage, WsOkResponse, WsErrResponse, WsStoppedEvent,
} from './ws-protocol';

const RPC_TIMEOUT_MS = 30_000;

export class ClientAdapter implements ISessionAdapter, IDebugAdapter {
  constructor(private readonly registry: ClientRegistry) {}

  // ── ISessionAdapter ────────────────────────────────────────────────────────

  startDebugging(configName: string): Promise<StopEvent | null> {
    return this.rpc<StopEvent | null>({ kind: 'command', type: 'startDebugging',
      requestId: crypto.randomUUID(), configName });
  }

  stopDebugging(): Promise<void> {
    return this.rpc<void>({ kind: 'command', type: 'stopDebugging',
      requestId: crypto.randomUUID() });
  }

  restartDebugging(): Promise<StopEvent> {
    return this.rpc<StopEvent>({ kind: 'command', type: 'restartDebugging',
      requestId: crypto.randomUUID() });
  }

  sendExecution(cmd: 'continue' | 'next' | 'stepIn' | 'stepOut'): Promise<StopEvent | null> {
    return this.rpc<StopEvent | null>({ kind: 'command', type: 'sendExecution',
      requestId: crypto.randomUUID(), cmd });
  }

  sendUntil(file: string, line: number): Promise<StopEvent | null> {
    return this.rpc<StopEvent | null>({ kind: 'command', type: 'sendUntil',
      requestId: crypto.randomUUID(), file, line });
  }

  sendJump(file: string, line: number): Promise<StopEvent | { ok: false; error: string }> {
    return this.rpc<StopEvent | { ok: false; error: string }>({ kind: 'command',
      type: 'sendJump', requestId: crypto.randomUUID(), file, line });
  }

  evaluate(expression: string, frameId: number, context?: string): Promise<EvalResult> {
    return this.rpc<EvalResult>({ kind: 'command', type: 'evaluate',
      requestId: crypto.randomUUID(), expression, frameId, context });
  }

  scopes(frameId: number): Promise<{ scopes: any[] }> {
    return this.rpc<{ scopes: any[] }>({ kind: 'command', type: 'scopes',
      requestId: crypto.randomUUID(), frameId });
  }

  variables(variablesReference: number): Promise<{ variables: any[] }> {
    return this.rpc<{ variables: any[] }>({ kind: 'command', type: 'variables',
      requestId: crypto.randomUUID(), variablesReference });
  }

  // ── IDebugAdapter ──────────────────────────────────────────────────────────
  // Fire-and-forget: BreakpointManager returns void; we send and don't block.

  addBreakpoint(file: string, line: number, condition?: string, enabled = true): void {
    if (!this.registry.connected) return;
    try {
      this.registry.send({ kind: 'command', type: 'addBreakpoint',
        requestId: crypto.randomUUID(), file, line, condition, enabled });
    } catch { /* swallow — breakpoints sync on reconnect */ }
  }

  removeBreakpoint(file: string, line: number): void {
    if (!this.registry.connected) return;
    try {
      this.registry.send({ kind: 'command', type: 'removeBreakpoint',
        requestId: crypto.randomUUID(), file, line });
    } catch { /* swallow */ }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Send a WsCommand and await the matching WsResponse.
   *
   * WHAT: Correlates command → response by requestId with a timeout guard.
   * WHY:  If the extension crashes mid-command the server must not hang.
   * WHEN: Called by every ISessionAdapter method.
   */
  private rpc<T>(cmd: WsCommand): Promise<T> {
    if (!this.registry.connected) {
      return Promise.reject(Object.assign(
        new Error('no debug client connected'),
        { code: 'NO_CLIENT' },
      ));
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`rpc timeout: ${cmd.type}`));
      }, RPC_TIMEOUT_MS);

      const unsubscribe = this.registry.onMessage((msg: WsClientMessage) => {
        if (msg.kind !== 'response' || msg.requestId !== cmd.requestId) return;
        clearTimeout(timer);
        unsubscribe();
        if (msg.ok) {
          resolve((msg as WsOkResponse).payload as T);
        } else {
          reject(new Error((msg as WsErrResponse).error));
        }
      });

      try {
        this.registry.send(cmd);
      } catch (e) {
        clearTimeout(timer);
        unsubscribe();
        reject(e);
      }
    });
  }
}
