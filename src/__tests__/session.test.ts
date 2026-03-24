/**
 * Sprint 2 — Session lifecycle
 * Tests SessionManager directly with a fake ISessionAdapter (no vscode, no network).
 */

import { SessionManager } from '../session';
import { ISessionAdapter, StopEvent } from '../ISessionAdapter';

const ENTRY: StopEvent = { file: '/app/app.py', line: 1, reason: 'entry' };

function makeSession(): SessionManager {
  const fake: ISessionAdapter = {
    async startDebugging(name): Promise<StopEvent | null> {
      return name === 'Debug Backend' ? ENTRY : null;
    },
    async stopDebugging() {},
    async restartDebugging(): Promise<StopEvent> { return ENTRY; },
    async sendExecution() { return { file: '/app/app.py', line: 2, reason: 'step' }; },
    async sendUntil(_f, l) { return { file: '/app/app.py', line: l, reason: 'step' }; },
    async sendJump(_f, l) { return { file: '/app/app.py', line: l, reason: 'goto' }; },
  };
  return new SessionManager(fake);
}

describe('SessionManager — session lifecycle (Sprint 2)', () => {
  let sm: SessionManager;
  beforeEach(() => { sm = makeSession(); });

  test('start returns state:paused for a valid config', async () => {
    const r = await sm.start('Debug Backend');
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
    expect(typeof r.sessionId).toBe('string');
  });

  test('start returns ok:false for unknown config', async () => {
    const r = await sm.start('Nonexistent Config');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });

  test('status returns idle when no session is running', async () => {
    const r = await sm.status();
    expect(r.state).toBe('idle');
  });

  test('status returns paused after start', async () => {
    await sm.start('Debug Backend');
    const r = await sm.status();
    expect(r.state).toBe('paused');
  });

  test('quit stops the session', async () => {
    await sm.start('Debug Backend');
    await sm.quit();
    const r = await sm.status();
    expect(['idle', 'exited']).toContain(r.state);
  });

  test('restart resumes from the beginning', async () => {
    await sm.start('Debug Backend');
    sm.setPaused('/app/app.py', 50); // simulate being partway through
    const r = await sm.restart();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
    expect(r.line).toBe(1);
  });

  test('quit on idle session is a no-op', async () => {
    const r = await sm.quit();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('idle');
  });
});
