/**
 * Sprint 3 — Execution control (unit tests)
 * Tests DebugStateMachine execution methods via a fake ISessionAdapter.
 * Semantic correctness (actually stops at the right line) is covered by sprint3.test.ts (e2e).
 */

import { DebugStateMachine } from '../session';
import { ISessionAdapter, StopEvent, ExecCmd } from '../ISessionAdapter';

const ENTRY: StopEvent = { file: '/app/app.py', line: 1, reason: 'entry' };

function makeSession(overrides: {
  execResult?: StopEvent | null;
  jumpResult?: StopEvent | { ok: false; error: string };
} = {}): DebugStateMachine {
  const fake: ISessionAdapter = {
    async startDebugging(name) { return name === 'Debug Backend' ? ENTRY : null; },
    async stopDebugging() {},
    async restartDebugging() { return ENTRY; },
    async sendExecution(_cmd: ExecCmd) {
      return overrides.execResult !== undefined
        ? overrides.execResult
        : { file: '/app/app.py', line: 2, reason: 'step' };
    },
    async sendUntil(_file, line) { return { file: '/app/app.py', line, reason: 'step' }; },
    async sendJump(_file, line) {
      if (overrides.jumpResult !== undefined) return overrides.jumpResult;
      if (line === 999) return { error: 'jump not allowed across function boundaries', ok: false };
      return { file: '/app/app.py', line, reason: 'goto' };
    },
    async evaluate() { return { result: '' }; },
    async scopes()   { return { scopes: [] }; },
    async variables(){ return { variables: [] }; },
  };
  return new DebugStateMachine(fake);
}

async function startedSession(overrides = {}): Promise<DebugStateMachine> {
  const sm = makeSession(overrides);
  await sm.start('Debug Backend');
  return sm;
}

describe('DebugStateMachine — execution control (Sprint 3)', () => {

  // ── continue ──────────────────────────────────────────────────────────────

  test('continue: transitions to paused when stopped at breakpoint', async () => {
    const sm = await startedSession({ execResult: { file: '/app/app.py', line: 42, reason: 'breakpoint' } });
    const r = await sm.continue();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
    expect(r.reason).toBe('breakpoint');
    expect(r.line).toBe(42);
  });

  test('continue: transitions to exited when session ends', async () => {
    const sm = await startedSession({ execResult: null });
    const r = await sm.continue();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('exited');
  });

  test('continue: returns error when not paused', async () => {
    const sm = makeSession(); // idle, no session started
    const r = await sm.continue();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not paused/i);
  });

  // ── next ──────────────────────────────────────────────────────────────────

  test('next: transitions to paused with step reason', async () => {
    const sm = await startedSession({ execResult: { file: '/app/app.py', line: 2, reason: 'step' } });
    const r = await sm.next();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
    expect(r.reason).toBe('step');
    expect(r.line).toBeGreaterThan(1);
  });

  test('next: updates file and line in status', async () => {
    const sm = await startedSession({ execResult: { file: '/app/app.py', line: 5, reason: 'step' } });
    await sm.next();
    const s = await sm.status();
    expect(s.line).toBe(5);
  });

  // ── step ──────────────────────────────────────────────────────────────────

  test('step: transitions to paused', async () => {
    const sm = await startedSession();
    const r = await sm.step();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
  });

  // ── return ────────────────────────────────────────────────────────────────

  test('return: transitions to paused', async () => {
    const sm = await startedSession();
    const r = await sm.return();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
  });

  // ── until ─────────────────────────────────────────────────────────────────

  test('until(line): stops at specified line', async () => {
    const sm = await startedSession();
    const r = await sm.until(20);
    expect(r.ok).toBe(true);
    expect(r.line).toBe(20);
  });

  test('until(): advances via next when no line given', async () => {
    const sm = await startedSession({ execResult: { file: '/app/app.py', line: 2, reason: 'step' } });
    const r = await sm.until();
    expect(r.ok).toBe(true);
    expect(r.state).toBe('paused');
    expect(r.line).toBeGreaterThan(1);
  });

  // ── jump ──────────────────────────────────────────────────────────────────

  test('jump: moves to target line', async () => {
    const sm = await startedSession();
    const r = await sm.jump(50);
    expect(r.ok).toBe(true);
    expect(r.line).toBe(50);
    const s = await sm.status();
    expect(s.line).toBe(50);
  });

  test('jump: returns ok:false when adapter rejects', async () => {
    const sm = await startedSession();
    const r = await sm.jump(999);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/jump/i);
  });

  // ── consecutive steps ─────────────────────────────────────────────────────

  test('two next() calls advance sequentially', async () => {
    let callCount = 0;
    const fake: ISessionAdapter = {
      async startDebugging(name) { return name === 'Debug Backend' ? ENTRY : null; },
      async stopDebugging() {},
      async restartDebugging() { return ENTRY; },
      async sendExecution() { callCount++; return { file: '/app/app.py', line: callCount + 1, reason: 'step' }; },
      async sendUntil(_f, l) { return { file: '/app/app.py', line: l, reason: 'step' }; },
      async sendJump(_f, l) { return { file: '/app/app.py', line: l, reason: 'goto' }; },
      async evaluate() { return { result: '' }; },
      async scopes()   { return { scopes: [] }; },
      async variables(){ return { variables: [] }; },
    };
    const sm = new DebugStateMachine(fake);
    await sm.start('Debug Backend');
    const r1 = await sm.next();
    const r2 = await sm.next();
    expect(r2.line!).toBeGreaterThan(r1.line!);
  });
});
