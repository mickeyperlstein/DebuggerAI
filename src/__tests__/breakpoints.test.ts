import { BreakpointManager } from '../breakpoints';
import { IDebugAdapter } from '../IDebugAdapter';

/** In-memory fake — no vscode, no DOM, no network. */
function makeManager(): BreakpointManager {
  const fake: IDebugAdapter = { addBreakpoint: jest.fn(), removeBreakpoint: jest.fn() };
  return new BreakpointManager(fake);
}

describe('BreakpointManager', () => {
  let mgr: BreakpointManager;
  beforeEach(() => { mgr = makeManager(); });

  // ── set ────────────────────────────────────────────────────────────────────

  test('set returns a breakpoint with defaults', () => {
    const r = mgr.set('/app/app.py', 42);
    expect(r).toMatchObject({ data: { file: '/app/app.py', line: 42, condition: null, enabled: true, temporary: false }, ok: true });
    expect(typeof r.data?.id).toBe('string');
  });

  test('set stores condition', () => {
    expect(mgr.set('/app/app.py', 42, 'x > 100').data?.condition).toBe('x > 100');
  });

  test('set normalises condition "True" to null', () => {
    expect(mgr.set('/app/app.py', 42, 'True').data?.condition).toBeNull();
  });

  test('set rejects line < 1', () => {
    expect(mgr.set('/app/app.py', 0)).toMatchObject({ ok: false });
  });

  // ── list ───────────────────────────────────────────────────────────────────

  test('list is empty initially', () => {
    expect(mgr.list()).toMatchObject({ data: [], ok: true });
  });

  test('list returns all breakpoints', () => {
    mgr.set('/app/app.py', 10);
    mgr.set('/app/app.py', 42);
    expect(mgr.list().data).toHaveLength(2);
  });

  // ── edit ───────────────────────────────────────────────────────────────────

  test('edit updates condition', () => {
    const id = mgr.set('/app/app.py', 42).data!.id;
    const r = mgr.edit(id, { condition: 'y < 0' });
    expect(r.data?.condition).toBe('y < 0');
  });

  test('edit returns error for unknown id', () => {
    expect(mgr.edit('bad-id', { condition: null })).toMatchObject({ ok: false });
  });

  // ── clear ──────────────────────────────────────────────────────────────────

  test('clear removes breakpoint', () => {
    const id = mgr.set('/app/app.py', 42).data!.id;
    expect(mgr.clear(id).ok).toBe(true);
    expect(mgr.list().data).toHaveLength(0);
  });

  test('clear returns error for unknown id', () => {
    expect(mgr.clear('nope')).toMatchObject({ ok: false });
  });

  test('clearAll empties the store', () => {
    mgr.set('/app/app.py', 10);
    mgr.set('/app/app.py', 42);
    mgr.clearAll();
    expect(mgr.list().data).toHaveLength(0);
  });

  // ── disable / enable ───────────────────────────────────────────────────────

  test('disable sets enabled:false', () => {
    const id = mgr.set('/app/app.py', 42).data!.id;
    expect(mgr.disable(id).data?.enabled).toBe(false);
  });

  test('enable restores enabled:true', () => {
    const id = mgr.set('/app/app.py', 42).data!.id;
    mgr.disable(id);
    expect(mgr.enable(id).data?.enabled).toBe(true);
  });

  // ── ignore ─────────────────────────────────────────────────────────────────

  test('ignore sets ignoreCount', () => {
    const id = mgr.set('/app/app.py', 42).data!.id;
    expect(mgr.ignore(id, 5).data?.ignoreCount).toBe(5);
  });

  // ── temporary ──────────────────────────────────────────────────────────────

  test('set with temporary:true marks bp as temporary', () => {
    expect(mgr.set('/app/app.py', 80, null, true).data?.temporary).toBe(true);
  });
});
