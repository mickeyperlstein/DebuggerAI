/**
 * Unit tests for LanguageStrategy implementations.
 * No vscode required — strategies receive session as `any`.
 */

import { PythonStrategy } from '../strategies/PythonStrategy';
import { NodeStrategy }   from '../strategies/NodeStrategy';

// ── NodeStrategy ──────────────────────────────────────────────────────────────

describe('NodeStrategy', () => {
  const strategy = new NodeStrategy();

  test('getLanguageName returns node', () => {
    expect(strategy.getLanguageName()).toBe('node');
  });

  test('resolveFrameId returns cachedFrameId unchanged', async () => {
    const result = await strategy.resolveFrameId({}, {
      hasVsCodeProxy: true,
      threadId: 1,
      cachedFrameId: 42,
    });
    expect(result).toBe(42);
  });

  test('resolveFrameId returns undefined when no cachedFrameId', async () => {
    const result = await strategy.resolveFrameId({}, { hasVsCodeProxy: true });
    expect(result).toBeUndefined();
  });
});

// ── PythonStrategy ────────────────────────────────────────────────────────────

describe('PythonStrategy', () => {
  const strategy = new PythonStrategy();

  test('getLanguageName returns python', () => {
    expect(strategy.getLanguageName()).toBe('python');
  });

  test('resolveFrameId returns rawTopFrameId when available (pre-translation raw ID)', async () => {
    const mockSession = { customRequest: jest.fn() };
    const result = await strategy.resolveFrameId(mockSession, {
      hasVsCodeProxy: true,
      threadId: 1,
      rawTopFrameId: 4302698784,
      cachedFrameId: 3,
    });
    // Should NOT call customRequest — uses the intercepted raw ID directly
    expect(mockSession.customRequest).not.toHaveBeenCalled();
    expect(result).toBe(4302698784);
  });

  test('resolveFrameId falls back to cachedFrameId when rawTopFrameId is absent', async () => {
    const mockSession = { customRequest: jest.fn() };
    const result = await strategy.resolveFrameId(mockSession, {
      hasVsCodeProxy: true,
      threadId: 1,
      cachedFrameId: 77,
    });
    expect(mockSession.customRequest).not.toHaveBeenCalled();
    expect(result).toBe(77);
  });

  test('resolveFrameId returns undefined when both rawTopFrameId and cachedFrameId are absent', async () => {
    const mockSession = { customRequest: jest.fn() };
    const result = await strategy.resolveFrameId(mockSession, {
      hasVsCodeProxy: true,
    });
    expect(result).toBeUndefined();
  });
});
