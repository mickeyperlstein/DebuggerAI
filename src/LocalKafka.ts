/**
 * LocalKafka — in-memory IKafkaStore implementation.
 *
 * WHAT: SRP class implementing IKafkaStore with no external dependencies.
 *       Topic store lives in-process; records are delivered to all active
 *       consumers synchronously in subscription order.
 * WHY:  Sufficient to power sessionId routing and wildcard subscriptions.
 *       Swapping to a real Kafka broker requires only injecting a different
 *       IKafkaStore at the composition root.
 * DEFERRED: offset tracking, seek, consumer groups, partition logic (v2).
 */

import { IKafkaStore, ProducerRecord, RecordMetadata, ConsumerRecord, MessageHandler } from './IKafkaStore';

interface TopicState {
  nextOffset: number;
  handlers: Set<MessageHandler>;
}

export class LocalKafka implements IKafkaStore {
  private readonly topics = new Map<string, TopicState>();

  async produce(record: ProducerRecord): Promise<RecordMetadata> {
    const state = this.ensureTopic(record.topic);
    const offset = String(state.nextOffset++);
    const consumerRecord: ConsumerRecord = {
      topic:     record.topic,
      partition: 0,
      offset,
      key:       record.key,
      value:     record.value,
      headers:   record.headers,
      timestamp: record.timestamp ?? Date.now(),
    };
    for (const handler of state.handlers) {
      void Promise.resolve(handler(consumerRecord));
    }
    return { topic: record.topic, partition: 0, offset };
  }

  consume(topic: string, handler: MessageHandler): () => void {
    const state = this.ensureTopic(topic);
    state.handlers.add(handler);
    return () => state.handlers.delete(handler);
  }

  async listTopics(): Promise<string[]> {
    return Array.from(this.topics.keys());
  }

  async createTopic(topic: string): Promise<void> {
    this.ensureTopic(topic);
  }

  private ensureTopic(topic: string): TopicState {
    let state = this.topics.get(topic);
    if (!state) {
      state = { nextOffset: 0, handlers: new Set() };
      this.topics.set(topic, state);
    }
    return state;
  }
}
