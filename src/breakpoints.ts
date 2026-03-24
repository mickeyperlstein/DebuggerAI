import * as crypto from 'crypto';
import { IDebugAdapter } from './IDebugAdapter';
import { Breakpoint, BpResult, BpListResult } from './types';
import { log } from './log';

/**
 * Pure breakpoint state + coordination.
 * No vscode imports — depends only on IDebugAdapter (injected).
 * All methods return Result<T> — no exceptions escape.
 */
export class BreakpointManager {
  private readonly store = new Map<string, Breakpoint>();

  constructor(private readonly adapter: IDebugAdapter) {}

  set(file: string, line: number, condition: string | null = null, temporary = false): BpResult {
    if (line < 1) return { ok: false, error: `line must be ≥ 1, got ${line}` };

    const bp: Breakpoint = {
      id: crypto.randomUUID(),
      file, line,
      condition: condition === 'True' ? null : condition,
      enabled: true,
      temporary,
      ignoreCount: 0,
    };

    this.store.set(bp.id, bp);
    this.adapter.addBreakpoint(file, line, bp.condition ?? undefined, true);
    return { ok: true, data: bp };
  }

  edit(id: string, patch: Partial<Pick<Breakpoint, 'condition' | 'enabled' | 'line'>>): BpResult {
    const bp = this.store.get(id);
    if (!bp) return { ok: false, error: `no breakpoint: ${id}` };

    this.adapter.removeBreakpoint(bp.file, bp.line);
    const updated = { ...bp, ...patch };
    this.adapter.addBreakpoint(updated.file, updated.line, updated.condition ?? undefined, updated.enabled);
    this.store.set(id, updated);
    return { ok: true, data: updated };
  }

  clear(id: string): BpResult {
    const bp = this.store.get(id);
    if (!bp) return { ok: false, error: `no breakpoint: ${id}` };
    this.adapter.removeBreakpoint(bp.file, bp.line);
    this.store.delete(id);
    return { ok: true, data: bp };
  }

  clearAll(): BpListResult {
    this.store.forEach(bp => this.adapter.removeBreakpoint(bp.file, bp.line));
    this.store.clear();
    return { ok: true, data: [] };
  }

  list(): BpListResult {
    return { ok: true, data: [...this.store.values()] };
  }

  /** Called by the vscode.debug.onDidChangeBreakpoints listener — keeps store
   *  in sync with breakpoints the user sets/removes manually in the editor. */
  syncExternal(op: 'added' | 'removed' | 'changed', file: string, line: number, condition: string | null, enabled: boolean): void {
    const existing = [...this.store.values()].find(b => b.file === file && b.line === line);
    if (op === 'removed') {
      if (existing) { this.store.delete(existing.id); log({ event: 'bp_sync', op, file, line }); }
      return;
    }
    if (existing) {
      this.store.set(existing.id, { ...existing, condition, enabled });
    } else {
      const bp: Breakpoint = { id: crypto.randomUUID(), file, line, condition, enabled, temporary: false, ignoreCount: 0 };
      this.store.set(bp.id, bp);
    }
    log({ event: 'bp_sync', op, file, line, condition, enabled });
  }

  // Convenience methods that delegate to edit()
  disable = (id: string) => this.edit(id, { enabled: false });
  enable  = (id: string) => this.edit(id, { enabled: true  });

  ignore(id: string, count: number): BpResult {
    const bp = this.store.get(id);
    if (!bp) return { ok: false, error: `no breakpoint: ${id}` };
    const updated = { ...bp, ignoreCount: count };
    this.store.set(id, updated);
    return { ok: true, data: updated };
  }
}
