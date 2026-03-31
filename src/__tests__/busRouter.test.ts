/**
 * BusRouter — unit tests for sessionId routing and wildcard subscriptions.
 */

import { BusRouter } from '../BusRouter';
import { BusMessage } from '../types';

describe('BusRouter', () => {
  test('publish delivers message to session subscriber', async () => {
    const router = new BusRouter();
    const received: BusMessage[] = [];
    router.subscribe('session-1', msg => { received.push(msg); });
    await router.publish('session-1', 'claude', 'dap.stopped', { line: 10 });
    expect(received).toHaveLength(1);
    expect(received[0].sessionId).toBe('session-1');
    expect(received[0].source).toBe('claude');
    expect(received[0].topic).toBe('dap.stopped');
    expect(received[0].payload).toEqual({ line: 10 });
  });

  test('publish does not deliver to a subscriber on a different sessionId', async () => {
    const router = new BusRouter();
    const received: BusMessage[] = [];
    router.subscribe('session-2', msg => { received.push(msg); });
    await router.publish('session-1', 'vscode', 'dap.stopped', {});
    expect(received).toHaveLength(0);
  });

  test('wildcard subscriber receives messages from all sessions', async () => {
    const router = new BusRouter();
    const received: string[] = [];
    router.subscribe('*', msg => { received.push(msg.sessionId); });
    await router.publish('abc', 'a', 'topic', {});
    await router.publish('xyz', 'b', 'topic', {});
    expect(received).toEqual(['abc', 'xyz']);
  });

  test('session subscriber does not receive messages from other sessions via wildcard', async () => {
    const router = new BusRouter();
    const specific: BusMessage[] = [];
    const wildcard: BusMessage[] = [];
    router.subscribe('session-1', msg => { specific.push(msg); });
    router.subscribe('*', msg => { wildcard.push(msg); });
    await router.publish('session-2', 's', 't', {});
    expect(specific).toHaveLength(0);
    expect(wildcard).toHaveLength(1);
  });

  test('session is created implicitly on first publish', async () => {
    const router = new BusRouter();
    const msg = await router.publish('new-session', 'src', 'event', { data: 1 });
    expect(msg.sessionId).toBe('new-session');
    expect(msg.seq).toBe(1);
  });

  test('seq is monotonically increasing across sessions', async () => {
    const router = new BusRouter();
    const m1 = await router.publish('s1', 'x', 't', {});
    const m2 = await router.publish('s2', 'x', 't', {});
    const m3 = await router.publish('s1', 'x', 't', {});
    expect(m1.seq).toBe(1);
    expect(m2.seq).toBe(2);
    expect(m3.seq).toBe(3);
  });

  test('unsubscribe stops delivery for session subscriber', async () => {
    const router = new BusRouter();
    const received: BusMessage[] = [];
    const unsub = router.subscribe('s1', msg => { received.push(msg); });
    await router.publish('s1', 'x', 't', {});
    unsub();
    await router.publish('s1', 'x', 't', {});
    expect(received).toHaveLength(1);
  });

  test('unsubscribe stops delivery for wildcard subscriber', async () => {
    const router = new BusRouter();
    const received: BusMessage[] = [];
    const unsub = router.subscribe('*', msg => { received.push(msg); });
    await router.publish('s1', 'x', 't', {});
    unsub();
    await router.publish('s2', 'x', 't', {});
    expect(received).toHaveLength(1);
  });

  test('ts field is a unix millisecond timestamp', async () => {
    const before = Date.now();
    const router = new BusRouter();
    const msg = await router.publish('s', 'src', 'topic', {});
    const after = Date.now();
    expect(msg.ts).toBeGreaterThanOrEqual(before);
    expect(msg.ts).toBeLessThanOrEqual(after);
  });
});
