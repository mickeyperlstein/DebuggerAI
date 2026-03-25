/**
 * Single source of truth for all types.
 * Every layer (manager, server, CLI, MCP) imports from here only.
 */

export interface Breakpoint {
  id: string;
  file: string;
  line: number;          // 1-based
  condition: string | null;
  enabled: boolean;
  temporary: boolean;
  ignoreCount: number;
}

export interface Result<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// Convenience aliases
export type BpResult    = Result<Breakpoint>;
export type BpListResult = Result<Breakpoint[]>;

export interface ApiRequest {
  command:
    // Sprint 1 — breakpoints
    | 'set' | 'edit' | 'list' | 'clear' | 'clearAll'
    // Sprint 2 — session lifecycle
    | 'start' | 'quit' | 'restart' | 'status'
    // Sprint 3 — execution control
    | 'continue' | 'next' | 'step' | 'return' | 'until' | 'jump'
    // Sprint 4 — inspection
    | 'print' | 'prettyPrint' | 'whatis' | 'exec' | 'display' | 'undisplay' | 'args' | 'retval';
  id?: string;
  file?: string;
  line?: number;
  condition?: string | null;
  enabled?: boolean;
  temporary?: boolean;
  config?: string;       // for start
  expression?: string;   // for print / prettyPrint / whatis / exec / display / undisplay
}
