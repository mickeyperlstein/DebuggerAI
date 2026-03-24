/**
 * Sprint 4 — Variable inspection
 * p, pp, whatis, !, display, undisplay, args, retval
 * All FAIL until DapDebugger.print / exec / display are implemented.
 */

import { IDebugger } from '../interfaces/IDebugger';

declare function makeDebugger(): IDebugger;

describe.skip('IDebugger — inspection (Sprint 4)', () => {
  let dbg: IDebugger;

  beforeEach(async () => {
    dbg = makeDebugger();
    await dbg.start('Debug Backend');
    await dbg.setBreakpoint('/app/app.py', 42);
    await dbg.continue(); // paused at line 42, locals: x=7, items=[1,2,3]
  });

  afterEach(() => dbg.quit());

  // ── print ─────────────────────────────────────────────────────────────────

  test('print returns value of a variable', async () => {
    const r = await dbg.print('x');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(7);
    expect(r.valueRepr).toBe('7');
  });

  test('print evaluates an expression', async () => {
    const r = await dbg.print('x * 2 + 1');
    expect(r.value).toBe(15);
  });

  test('print returns ok:false with NameError for undefined variable', async () => {
    const r = await dbg.print('nonexistent');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/NameError/i);
  });

  test('print does not crash session on exception', async () => {
    await dbg.print('1 / 0');
    const s = await dbg.status();
    expect(s.state).toBe('paused'); // still alive
  });

  // ── prettyPrint ───────────────────────────────────────────────────────────

  test('prettyPrint returns same value as print for simple types', async () => {
    const p = await dbg.print('x');
    const pp = await dbg.prettyPrint('x');
    expect(pp.value).toEqual(p.value);
  });

  test('prettyPrint formats nested structures with indentation', async () => {
    const r = await dbg.prettyPrint('items');
    expect(r.valueRepr).toContain('['); // at minimum it's a list repr
  });

  // ── whatis ────────────────────────────────────────────────────────────────

  test('whatis returns type string', async () => {
    const r = await dbg.whatis('x');
    expect(r.ok).toBe(true);
    expect(r.type).toMatch(/int/i);
  });

  test('whatis on a list', async () => {
    const r = await dbg.whatis('items');
    expect(r.type).toMatch(/list/i);
  });

  // ── exec ──────────────────────────────────────────────────────────────────

  test('exec mutates a variable in the current frame', async () => {
    await dbg.exec('x = 99');
    const r = await dbg.print('x');
    expect(r.value).toBe(99);
  });

  test('exec appends to a list', async () => {
    await dbg.exec('items.append(99)');
    const r = await dbg.print('len(items)');
    expect(r.value).toBe(4);
  });

  // ── args ──────────────────────────────────────────────────────────────────

  test('args returns current function argument values', async () => {
    const r = await dbg.args();
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toBeDefined();
  });

  // ── display / undisplay ───────────────────────────────────────────────────

  test('display registers an expression for auto-print', async () => {
    const r = await dbg.display('x');
    expect(r.ok).toBe(true);
    expect(r.valueRepr).toContain('x');
  });

  test('undisplay removes expression', async () => {
    await dbg.display('x');
    const r = await dbg.undisplay('x');
    expect(r.ok).toBe(true);
  });

  test('undisplay with no args clears all', async () => {
    await dbg.display('x');
    await dbg.display('items');
    const r = await dbg.undisplay();
    expect(r.ok).toBe(true);
  });
});
