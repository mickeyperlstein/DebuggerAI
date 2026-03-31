/**
 * LocalKafka — unit tests for IKafkaStore in-memory implementation.
 */

import { LocalKafka } from '../LocalKafka';
import { ConsumerRecord } from '../IKafkaStore';

describe('LocalKafka', () => {
  test('produce returns RecordMetadata with offset "0" for first record', async () => {
    const store = new LocalKafka();
    const meta = await store.produce({ topic: 'test', value: 'hello' });
    expect(meta.topic).toBe('test');
    expect(meta.partition).toBe(0);
    expect(meta.offset).toBe('0');
  });

  test('produce increments offset per topic', async () => {
    const store = new LocalKafka();
    const m0 = await store.produce({ topic: 'events', value: 'a' });
    const m1 = await store.produce({ topic: 'events', value: 'b' });
    const m2 = await store.produce({ topic: 'events', value: 'c' });
    expect(Number(m0.offset)).toBe(0);
    expect(Number(m1.offset)).toBe(1);
    expect(Number(m2.offset)).toBe(2);
  });

  test('produce creates topic implicitly', async () => {
    const store = new LocalKafka();
    await store.produce({ topic: 'auto-created', value: 1 });
    const topics = await store.listTopics();
    expect(topics).toContain('auto-created');
  });

  test('consume handler receives records published after subscription', async () => {
    const store = new LocalKafka();
    const received: ConsumerRecord[] = [];
    store.consume('events', r => { received.push(r); });
    await store.produce({ topic: 'events', value: 42 });
    expect(received).toHaveLength(1);
    expect(received[0].value).toBe(42);
    expect(received[0].topic).toBe('events');
  });

  test('consume handler does NOT receive records published before subscription', async () => {
    const store = new LocalKafka();
    await store.produce({ topic: 'events', value: 'before' });
    const received: unknown[] = [];
    store.consume('events', r => { received.push(r.value); });
    await store.produce({ topic: 'events', value: 'after' });
    expect(received).toEqual(['after']);
  });

  test('multiple handlers on same topic all receive the message', async () => {
    const store = new LocalKafka();
    const a: unknown[] = [];
    const b: unknown[] = [];
    store.consume('t', r => { a.push(r.value); });
    store.consume('t', r => { b.push(r.value); });
    await store.produce({ topic: 't', value: 'msg' });
    expect(a).toEqual(['msg']);
    expect(b).toEqual(['msg']);
  });

  test('unsubscribe stops delivery', async () => {
    const store = new LocalKafka();
    const received: unknown[] = [];
    const unsub = store.consume('t', r => { received.push(r.value); });
    await store.produce({ topic: 't', value: 'first' });
    unsub();
    await store.produce({ topic: 't', value: 'second' });
    expect(received).toEqual(['first']);
  });

  test('topics are isolated — handler only receives its own topic', async () => {
    const store = new LocalKafka();
    const received: unknown[] = [];
    store.consume('a', r => { received.push(r.value); });
    await store.produce({ topic: 'b', value: 'wrong' });
    expect(received).toHaveLength(0);
  });

  test('listTopics returns all created topics', async () => {
    const store = new LocalKafka();
    await store.createTopic('foo');
    await store.createTopic('bar');
    const topics = await store.listTopics();
    expect(topics).toContain('foo');
    expect(topics).toContain('bar');
  });

  test('createTopic is idempotent', async () => {
    const store = new LocalKafka();
    await store.createTopic('dup');
    await store.createTopic('dup');
    const topics = await store.listTopics();
    expect(topics.filter(t => t === 'dup')).toHaveLength(1);
  });
});
