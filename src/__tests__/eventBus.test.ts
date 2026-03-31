/**
 * EventBus — unit tests.
 */

import { LocalKafka } from '../LocalKafka';
import { EventBus }   from '../EventBus';

function makebus() {
  return new EventBus(new LocalKafka());
}

describe('EventBus', () => {
  test('subscriber receives payload after publish', async () => {
    const bus = makebus();
    const received: unknown[] = [];
    bus.subscribe('debug.events', p => { received.push(p); });
    await bus.publish('debug.events', { type: 'breakpoint-hit', line: 42 });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'breakpoint-hit', line: 42 });
  });

  test('multiple subscribers on same topic each receive every message', async () => {
    const bus = makebus();
    const a: unknown[] = [];
    const b: unknown[] = [];
    bus.subscribe('debug.events', p => { a.push(p); });
    bus.subscribe('debug.events', p => { b.push(p); });
    await bus.publish('debug.events', { type: 'step' });
    expect(a).toEqual([{ type: 'step' }]);
    expect(b).toEqual([{ type: 'step' }]);
  });

  test('subscriber on different topic receives nothing', async () => {
    const bus = makebus();
    const received: unknown[] = [];
    bus.subscribe('debug.events', p => { received.push(p); });
    await bus.publish('session.events', { type: 'started' });
    expect(received).toHaveLength(0);
  });

  test('subscriber only receives messages published after subscription', async () => {
    const bus = makebus();
    await bus.publish('debug.events', { seq: 1 });
    await bus.publish('debug.events', { seq: 2 });
    const received: unknown[] = [];
    bus.subscribe('debug.events', p => { received.push(p); });
    await bus.publish('debug.events', { seq: 3 });
    expect(received).toEqual([{ seq: 3 }]);
  });

  test('unsubscribe stops delivery', async () => {
    const bus = makebus();
    const received: unknown[] = [];
    const unsub = bus.subscribe('debug.events', p => { received.push(p); });
    await bus.publish('debug.events', { msg: 'first' });
    unsub();
    await bus.publish('debug.events', { msg: 'second' });
    expect(received).toEqual([{ msg: 'first' }]);
  });

  test('unsubscribing one handler does not affect others', async () => {
    const bus = makebus();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const unsubA = bus.subscribe('debug.events', p => { a.push(p); });
    bus.subscribe('debug.events', p => { b.push(p); });
    unsubA();
    await bus.publish('debug.events', { msg: 'after' });
    expect(a).toHaveLength(0);
    expect(b).toEqual([{ msg: 'after' }]);
  });
});
