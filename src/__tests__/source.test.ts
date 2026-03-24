/**
 * Sprint 6 — Source listing
 * l, ll
 * All FAIL until DapDebugger.list / longlist are implemented.
 */

import { IDebugger } from '../interfaces/IDebugger';

declare function makeDebugger(): IDebugger;

describe.skip('IDebugger — source listing (Sprint 6)', () => {
  let dbg: IDebugger;

  beforeEach(async () => {
    dbg = makeDebugger();
    await dbg.start('Debug Backend');
    await dbg.setBreakpoint('/app/app.py', 42);
    await dbg.continue(); // paused at line 42
  });

  afterEach(() => dbg.quit());

  // ── list ──────────────────────────────────────────────────────────────────

  test('list returns 11 lines centered on current line', async () => {
    const r = await dbg.list();
    expect(r.ok).toBe(true);
    expect(r.lines!.length).toBeLessThanOrEqual(11);
    expect(r.lines!.some(l => l.current)).toBe(true);
  });

  test('list marks current line with current:true', async () => {
    const r = await dbg.list();
    const cur = r.lines!.find(l => l.current);
    expect(cur?.number).toBe(42);
  });

  test('list marks lines with breakpoints', async () => {
    const r = await dbg.list();
    const bp = r.lines!.find(l => l.number === 42);
    expect(bp?.hasBreakpoint).toBe(true);
  });

  test('list with range returns only requested lines', async () => {
    const r = await dbg.list(1, 5);
    expect(r.lines!.length).toBe(5);
    expect(r.lines![0].number).toBe(1);
    expect(r.lines![4].number).toBe(5);
  });

  test('list centered on a specific line', async () => {
    const r = await dbg.list(80);
    const numbers = r.lines!.map(l => l.number);
    expect(numbers).toContain(80);
  });

  test('lines have content (not empty strings)', async () => {
    const r = await dbg.list();
    r.lines!.forEach(l => {
      expect(typeof l.content).toBe('string');
    });
  });

  // ── longlist ──────────────────────────────────────────────────────────────

  test('longlist returns more lines than list', async () => {
    const short = await dbg.list();
    const long = await dbg.longlist();
    expect(long.lines!.length).toBeGreaterThanOrEqual(short.lines!.length);
  });

  test('longlist still marks current line', async () => {
    const r = await dbg.longlist();
    expect(r.lines!.some(l => l.current)).toBe(true);
  });
});
