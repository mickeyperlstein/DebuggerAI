/**
 * Sprint 4 — Inspection (unit tests)
 * Tests SessionManager inspection methods via a fake ISessionAdapter.
 * Semantic correctness against a real debug session is covered by sprint4.test.ts (e2e).
 */

import { SessionManager } from '../session';
import { ISessionAdapter, StopEvent, EvalResult, ExecCmd } from '../ISessionAdapter';

const ENTRY: StopEvent = { file: '/app/app.js', line: 14, reason: 'entry', frameId: 1 };

type EvalFn = (expr: string, ctx?: string) => EvalResult;

function makeSession(overrides: {
  evalResponse?: EvalFn;
  scopesResult?: { scopes: any[] };
  varsResult?: (varRef: number) => { variables: any[] };
} = {}): SessionManager {
  const defaultEval: EvalFn = () => ({ result: '7', type: 'int' });
  const fake: ISessionAdapter = {
    async startDebugging(name)      { return name === 'Debug Backend' ? ENTRY : null; },
    async stopDebugging()           {},
    async restartDebugging()        { return ENTRY; },
    async sendExecution(_cmd: ExecCmd) { return ENTRY; },
    async sendUntil(_f, l)          { return { ...ENTRY, line: l }; },
    async sendJump(_f, l)           { return { ...ENTRY, line: l, reason: 'goto' }; },
    async evaluate(expr, _frameId, ctx) {
      return (overrides.evalResponse ?? defaultEval)(expr, ctx);
    },
    async scopes(_frameId) {
      return overrides.scopesResult ?? {
        scopes: [{ name: 'Arguments', presentationHint: 'arguments', variablesReference: 1 }],
      };
    },
    async variables(varRef) {
      return overrides.varsResult
        ? overrides.varsResult(varRef)
        : { variables: [{ name: 'a', value: '0', type: 'int' }] };
    },
  };
  return new SessionManager(fake);
}

async function startedSession(overrides = {}): Promise<SessionManager> {
  const sm = makeSession(overrides);
  await sm.start('Debug Backend');
  return sm;
}

describe('SessionManager — inspection (Sprint 4)', () => {

  // ── print ──────────────────────────────────────────────────────────────────

  test('print: returns valueRepr and type on success', async () => {
    const sm = await startedSession();
    const r = await sm.print('x');
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toBe('7');
    expect(r.type).toBe('int');
  });

  test('print: returns ok:false when adapter reports an error', async () => {
    const sm = await startedSession({
      evalResponse: (expr: string) => expr === 'nonexistent'
        ? { error: 'NameError: name nonexistent is not defined' }
        : { result: '7', type: 'int' },
    });
    const r = await sm.print('nonexistent');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/NameError/i);
  });

  test('print: session stays paused after evaluation error', async () => {
    const sm = await startedSession({ evalResponse: () => ({ error: 'ZeroDivisionError' }) });
    await sm.print('1 / 0');
    const s = await sm.status();
    expect(s.state).toBe('paused');
  });

  test('print: returns ok:false when not paused', async () => {
    const sm = makeSession(); // idle, no session started
    const r = await sm.print('x');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not paused/i);
  });

  // ── prettyPrint ────────────────────────────────────────────────────────────

  test('prettyPrint: returns valueRepr same as print for simple types', async () => {
    const sm = await startedSession();
    const p  = await sm.print('x');
    const pp = await sm.prettyPrint('x');
    expect(pp.ok).toBe(true);
    expect(pp.valueRepr).toBe(p.valueRepr);
  });

  // ── whatis ─────────────────────────────────────────────────────────────────

  test('whatis: returns type from adapter response', async () => {
    const sm = await startedSession({ evalResponse: () => ({ result: '7', type: 'int' }) });
    const r = await sm.whatis('x');
    expect(r.ok).toBe(true);
    expect(r.type).toBe('int');
    expect(r.valueRepr).toBe('int');
  });

  test('whatis: returns ok:false on error', async () => {
    const sm = await startedSession({ evalResponse: () => ({ error: 'NameError' }) });
    const r = await sm.whatis('missing');
    expect(r.ok).toBe(false);
  });

  // ── exec ───────────────────────────────────────────────────────────────────

  test('exec: calls adapter with repl context', async () => {
    let capturedContext: string | undefined;
    const sm = await startedSession({
      evalResponse: (_expr: string, ctx?: string) => { capturedContext = ctx; return { result: '' }; },
    });
    await sm.exec('x = 99');
    expect(capturedContext).toBe('repl');
  });

  test('exec: returns ok:false on error', async () => {
    const sm = await startedSession({ evalResponse: () => ({ error: 'SyntaxError' }) });
    const r = await sm.exec('???');
    expect(r.ok).toBe(false);
  });

  // ── display / undisplay ────────────────────────────────────────────────────

  test('display(expr): adds to registry and returns valueRepr containing expression', async () => {
    const sm = await startedSession();
    const r = await sm.display('x');
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toContain('x');
    expect(r.valueRepr).toContain('7');
  });

  test('display(): evaluates all registered expressions when called with no args', async () => {
    const sm = await startedSession();
    await sm.display('x');
    await sm.display('y');
    const r = await sm.display();
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toContain('x');
    expect(r.valueRepr).toContain('y');
  });

  test('undisplay(expr): removes expression from registry', async () => {
    const sm = await startedSession();
    await sm.display('x');
    const r = await sm.undisplay('x');
    expect(r.ok).toBe(true);
  });

  test('undisplay(): clears all registered expressions', async () => {
    const sm = await startedSession();
    await sm.display('x');
    await sm.display('y');
    const r = await sm.undisplay();
    expect(r.ok).toBe(true);
  });

  test('undisplay: works even when not paused (registry management only)', async () => {
    const sm = makeSession();
    const r = await sm.undisplay('x');
    expect(r.ok).toBe(true);
  });

  // ── args ───────────────────────────────────────────────────────────────────

  test('args: returns formatted argument values', async () => {
    const sm = await startedSession({
      scopesResult: { scopes: [{ name: 'Arguments', presentationHint: 'arguments', variablesReference: 1 }] },
      varsResult: () => ({ variables: [{ name: 'a', value: '0', type: 'int' }, { name: 'b', value: '10', type: 'int' }] }),
    });
    const r = await sm.args();
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toContain('a = 0');
    expect(r.valueRepr).toContain('b = 10');
  });

  test('args: returns ok:false when no arguments scope available', async () => {
    const sm = await startedSession({ scopesResult: { scopes: [] } });
    const r = await sm.args();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no arguments scope/i);
  });

  test('args: returns ok:false when not paused', async () => {
    const sm = makeSession();
    const r = await sm.args();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not paused/i);
  });

  // ── retval ─────────────────────────────────────────────────────────────────

  test('retval: returns value when (return value) variable is in scope', async () => {
    const sm = await startedSession({
      scopesResult: { scopes: [{ name: 'Local', presentationHint: 'locals', variablesReference: 2 }] },
      varsResult: () => ({ variables: [{ name: '(return value)', value: '10', type: 'int' }] }),
    });
    const r = await sm.retval();
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toBe('10');
    expect(r.type).toBe('int');
  });

  test('retval: returns ok:false when no return value in scope', async () => {
    const sm = await startedSession({
      scopesResult: { scopes: [{ name: 'Local', presentationHint: 'locals', variablesReference: 2 }] },
      varsResult: () => ({ variables: [{ name: 'x', value: '7', type: 'int' }] }),
    });
    const r = await sm.retval();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no return value/i);
  });

  test('retval: returns ok:false when not paused', async () => {
    const sm = makeSession();
    const r = await sm.retval();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not paused/i);
  });
});
