/**
 * BusRouter — routes BusMessages to subscribers by sessionId.
 *
 * WHAT: Maintains two subscriber buckets:
 *         - sessionSubscribers: Map<sessionId, Set<Handler>>
 *         - wildcardSubscribers: Set<Handler>  (subscribed with sessionId "*")
 *       Sessions are created implicitly on first publish (no explicit registration).
 * WHY:  Separates routing logic from the EventBus pub/sub primitive.
 *       EventBus handles topic-level delivery; BusRouter handles session-level routing.
 */

import { BusMessage } from './types';

export type BusHandler = (msg: BusMessage) => void | Promise<void>;

export class BusRouter {
  private readonly sessionSubscribers = new Map<string, Set<BusHandler>>();
  private readonly wildcardSubscribers = new Set<BusHandler>();
  private seq = 0;

  /**
   * Publish a message. The session is created implicitly on first publish.
   * Delivers to all handlers subscribed to this sessionId and all wildcard handlers.
   */
  async publish(sessionId: string, source: string, topic: string, payload: unknown): Promise<BusMessage> {
    const msg: BusMessage = {
      seq: ++this.seq,
      ts: Date.now(),
      source,
      topic,
      sessionId,
      payload,
    };

    const sessionHandlers = this.sessionSubscribers.get(sessionId);
    const targets: BusHandler[] = [
      ...(sessionHandlers ? Array.from(sessionHandlers) : []),
      ...Array.from(this.wildcardSubscribers),
    ];

    await Promise.all(targets.map(h => Promise.resolve(h(msg))));
    return msg;
  }

  /**
   * Subscribe to messages for a specific sessionId, or all sessions with "*".
   * Returns an unsubscribe function.
   */
  subscribe(sessionId: string, handler: BusHandler): () => void {
    if (sessionId === '*') {
      this.wildcardSubscribers.add(handler);
      return () => this.wildcardSubscribers.delete(handler);
    }

    let handlers = this.sessionSubscribers.get(sessionId);
    if (!handlers) {
      handlers = new Set();
      this.sessionSubscribers.set(sessionId, handlers);
    }
    handlers.add(handler);
    return () => handlers!.delete(handler);
  }
}
