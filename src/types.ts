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
  command: 'set' | 'edit' | 'list' | 'clear' | 'clearAll' | 'start' | 'quit' | 'restart' | 'status';
  id?: string;
  file?: string;
  line?: number;
  condition?: string | null;
  enabled?: boolean;
  temporary?: boolean;
  config?: string;  // for start
}
