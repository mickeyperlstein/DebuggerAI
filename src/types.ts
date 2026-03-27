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

/**
 * BusMessage — canonical envelope for every event on the shared debug session bus.
 * Schema: { seq, ts, source, topic, sessionId, payload }
 */
export interface BusMessage {
  /** Monotonic integer — ordering + replay index. */
  seq: number;
  /** Unix milliseconds — wall clock for video sync. */
  ts: number;
  /** Client id who published (e.g. "vscode", "claude", "aidbg"). */
  source: string;
  /** Topic string (e.g. "dap.stopped", "command", "session.abc123"). */
  topic: string;
  /** Session identifier. Use "*" for wildcard (receives all sessions). */
  sessionId: string;
  /** Raw message body. */
  payload: unknown;
}

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
