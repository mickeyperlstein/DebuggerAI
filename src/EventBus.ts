/**
 * EventBus — typed pub/sub wrapping an injected IKafkaStore.
 *
 * WHAT: Translates topic-based publish/subscribe calls into produce/consume
 *       calls on the underlying store. Each subscriber receives only messages
 *       published after it subscribed (no historical replay here).
 * WHY:  Decouples callers from the store protocol. Swapping the store
 *       implementation requires no changes to EventBus or its callers.
 * IoC chain: IKafkaStore → EventBus → session routing layer
 */

import { IKafkaStore } from './IKafkaStore';

export type Handler = (payload: unknown) => void | Promise<void>;

export class EventBus {
  constructor(private readonly store: IKafkaStore) {}

  /**
   * Publish a payload to a topic.
   * Topic is created implicitly on first publish (via LocalKafka.ensureTopic).
   */
  async publish(topic: string, payload: unknown): Promise<void> {
    await this.store.produce({ topic, value: payload });
  }

  /**
   * Subscribe a handler to a topic.
   * Handler receives only messages published after this call.
   * Returns an unsubscribe function.
   */
  subscribe(topic: string, handler: Handler): () => void {
    return this.store.consume(topic, record => handler(record.value));
  }
}
