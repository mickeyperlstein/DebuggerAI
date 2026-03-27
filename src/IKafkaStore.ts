/**
 * IKafkaStore — minimal Kafka-protocol-compatible store interface.
 *
 * WHAT: Pure interface modelling the kafkajs Producer/Consumer/Admin surface.
 *       V1 scope: produce, consume, listTopics, createTopic.
 *       Deferred to v2: offset tracking, seek, consumer groups, partitions.
 * WHY:  Lock the interface first so EventBus and LocalKafka can be built and
 *       tested independently; a real KafkaJS adapter can be dropped in later
 *       with no calling-code changes.
 */

export interface ProducerRecord {
  topic: string;
  key?: string;
  value: unknown;
  headers?: Record<string, string>;
  timestamp?: number;
}

export interface RecordMetadata {
  topic: string;
  partition: number;
  offset: string;
}

export interface ConsumerRecord {
  topic: string;
  partition: number;
  offset: string;
  key?: string;
  value: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

export type MessageHandler = (record: ConsumerRecord) => void | Promise<void>;

export interface IKafkaStore {
  /**
   * Publish a record to a topic.
   * Mirrors kafkajs Producer.send().
   * Implicit topic creation — topic is created on first produce if absent.
   */
  produce(record: ProducerRecord): Promise<RecordMetadata>;

  /**
   * Subscribe a handler to new records on a topic.
   * Mirrors kafkajs Consumer.run().
   * Returns an unsubscribe function.
   */
  consume(topic: string, handler: MessageHandler): () => void;

  /** List all known topic names. Mirrors kafkajs Admin.listTopics(). */
  listTopics(): Promise<string[]>;

  /** Ensure a topic exists. No-op if already present. Mirrors kafkajs Admin.createTopics(). */
  createTopic(topic: string): Promise<void>;
}
