/**
 * Sprint 5 — Stack navigation
 * bt, up, down, where
 * All FAIL until DapDebugger.backtrace / up / down are implemented.
 */

import { IDebugger } from '../interfaces/IDebugger';

declare function makeDebugger(): IDebugger;

describe.skip('IDebugger — stack navigation (Sprint 5)', () => {
  let dbg: IDebugger;

  beforeEach(async () => {
    dbg = makeDebugger();
    await dbg.start('Debug Backend');
    await dbg.setBreakpoint('/app/handlers.py', 42); // inside process_request()
    await dbg.continue();
    // call stack: process_request (0) → handle_route (1) → main (2)
  });

  afterEach(() => dbg.quit());

  // ── backtrace ─────────────────────────────────────────────────────────────

  test('backtrace returns all frames', async () => {
    const r = await dbg.backtrace();
    expect(r.ok).toBe(true);
    expect(r.frames!.length).toBeGreaterThanOrEqual(1);
    expect(r.frames![0].current).toBe(true);
  });

  test('backtrace positive count returns innermost N frames', async () => {
    const r = await dbg.backtrace(2);
    expect(r.frames!.length).toBeLessThanOrEqual(2);
  });

  test('backtrace negative count returns outermost N frames', async () => {
    const full = await dbg.backtrace();
    const r = await dbg.backtrace(-1);
    expect(r.frames![0].index).toBe(full.frames!.length - 1);
  });

  test('frames have required fields', async () => {
    const r = await dbg.backtrace();
    const f = r.frames![0];
    expect(typeof f.index).toBe('number');
    expect(typeof f.file).toBe('string');
    expect(typeof f.line).toBe('number');
    expect(typeof f.function).toBe('string');
  });

  // ── up ────────────────────────────────────────────────────────────────────

  test('up moves to caller frame', async () => {
    const before = (await dbg.backtrace()).frames!.find(f => f.current)!.index;
    await dbg.up();
    const after = (await dbg.backtrace()).frames!.find(f => f.current)!.index;
    expect(after).toBeGreaterThan(before);
  });

  test('up at outermost frame returns "Oldest frame" error', async () => {
    const full = await dbg.backtrace();
    // move to outermost
    await dbg.up(full.frames!.length);
    const r = await dbg.up();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/oldest/i);
  });

  // ── down ──────────────────────────────────────────────────────────────────

  test('down returns to inner frame after up', async () => {
    await dbg.up();
    const mid = (await dbg.backtrace()).frames!.find(f => f.current)!.index;
    await dbg.down();
    const after = (await dbg.backtrace()).frames!.find(f => f.current)!.index;
    expect(after).toBeLessThan(mid);
  });

  test('down at innermost frame returns "Newest frame" error', async () => {
    const r = await dbg.down();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/newest/i);
  });

  // ── p in non-current frame ────────────────────────────────────────────────

  test('print inspects variables in the selected frame after up', async () => {
    await dbg.up(); // move to handle_route frame
    const r = await dbg.print('req'); // req exists in handle_route, not process_request
    expect(r.ok).toBe(true);
  });
});
