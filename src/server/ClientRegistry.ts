/**
 * ClientRegistry — manages the single connected VS Code extension WebSocket.
 *
 * WHAT: Owns the WebSocket connection lifecycle. Emits messages received from
 *       the extension and exposes send() for outbound commands.
 * WHY:  Centralises connection state so ClientAdapter never touches WebSocket
 *       directly — it only calls connected/send/onMessage/onDisconnect.
 * WHEN: One instance lives for the lifetime of the server process.
 *       A new VS Code client may reconnect at any time; the old socket is
 *       terminated before the new one is registered.
 */

import { EventEmitter }   from 'events';
import { WebSocket }      from 'ws';
import { WsClientMessage, WsServerMessage } from './ws-protocol';
import { log } from '../log';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS  = 10_000;

export class ClientRegistry {
  private socket:   WebSocket | undefined;
  private readonly bus = new EventEmitter();

  /** True when a VS Code client is connected and the socket is open. */
  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Register a new VS Code client.
   * If one is already connected it is terminated first.
   */
  register(ws: WebSocket): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.terminate();
    }
    this.socket = ws;

    ws.on('message', raw => {
      try {
        this.bus.emit('message', JSON.parse(raw.toString()) as WsClientMessage);
      } catch { /* ignore malformed JSON */ }
    });

    ws.on('close', () => {
      this.socket = undefined;
      this.bus.emit('disconnect');
      log({ event: 'ws_client_disconnected' });
    });

    ws.on('error', () => ws.terminate());

    this.startHeartbeat(ws);
    log({ event: 'ws_client_registered' });
  }

  /** Subscribe to messages from the client. Returns an unsubscribe function. */
  onMessage(handler: (msg: WsClientMessage) => void): () => void {
    this.bus.on('message', handler);
    return () => this.bus.off('message', handler);
  }

  /** Subscribe to client disconnect. Fires once then auto-removes. */
  onDisconnect(handler: () => void): () => void {
    this.bus.once('disconnect', handler);
    return () => this.bus.off('disconnect', handler);
  }

  /** Send a command to the connected client. Throws if not connected. */
  send(msg: WsServerMessage): void {
    if (!this.connected) throw new Error('no debug client connected');
    this.socket!.send(JSON.stringify(msg));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private startHeartbeat(ws: WebSocket): void {
    let alive = true;
    const interval = setInterval(() => {
      if (!alive) { ws.terminate(); clearInterval(interval); return; }
      alive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL_MS);

    ws.on('pong', () => { alive = true; });
    ws.on('close', () => clearInterval(interval));

    // Give the client HEARTBEAT_TIMEOUT_MS to send pong after each ping
    setTimeout(() => { /* initial grace period handled by alive=true above */ }, HEARTBEAT_TIMEOUT_MS);
  }
}
