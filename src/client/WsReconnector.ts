/**
 * WsReconnector — WebSocket wrapper with automatic exponential-backoff reconnect.
 *
 * WHAT: Wraps a ws.WebSocket with reconnect logic, message subscription,
 *       and a simple send() API.
 * WHY:  Keeps VsCodeExtensionClient clean. The extension should survive
 *       server restarts without the user having to reload VS Code.
 * WHEN: Created once in VsCodeExtensionClient.connect().
 *
 * No vscode imports — pure Node.js.
 */

import { EventEmitter } from 'events';
import WebSocket        from 'ws';

const BACKOFF_MS  = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const MAX_RETRIES = 8;

export class WsReconnector {
  private ws:       WebSocket | undefined;
  private attempt   = 0;
  private stopped   = false;
  private readonly bus = new EventEmitter();

  constructor(private readonly url: string) {}

  connect(): void {
    if (this.stopped) return;
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.attempt = 0;
      this.bus.emit('open');
    });

    this.ws.on('message', raw => {
      try { this.bus.emit('message', JSON.parse(raw.toString())); }
      catch { /* ignore malformed */ }
    });

    this.ws.on('close', () => {
      this.bus.emit('close');
      this.scheduleReconnect();
    });

    this.ws.on('error', () => { /* close fires after error */ });
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage(handler: (msg: any) => void): () => void {
    this.bus.on('message', handler);
    return () => this.bus.off('message', handler);
  }

  onOpen(handler: () => void): () => void {
    this.bus.on('open', handler);
    return () => this.bus.off('open', handler);
  }

  close(): void {
    this.stopped = true;
    this.ws?.terminate();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.stopped || this.attempt >= MAX_RETRIES) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt++;
    setTimeout(() => this.connect(), delay);
  }
}
