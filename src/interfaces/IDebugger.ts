/**
 * Full pdb command surface as a typed interface.
 * Implemented sprint-by-sprint, TDD.
 * All return types come from src/types.ts — one source of truth.
 */

import { BpResult, BpListResult } from '../types';

// ── Future result types (defined here until session layer is built) ──────────

export type SessionState = 'idle' | 'starting' | 'paused' | 'running' | 'exited';
export type StopReason   = 'breakpoint' | 'step' | 'exception' | 'pause' | 'entry' | 'goto' | 'exited';

export interface SessionResult { ok: boolean; state: SessionState; file?: string; line?: number; function?: string; sessionId?: string; exitCode?: number; error?: string; }
export interface StepResult    { ok: boolean; state: SessionState; file?: string; line?: number; function?: string; reason?: StopReason; error?: string; }
export interface InspectResult { ok: boolean; valueRepr?: string; value?: unknown; type?: string; truncated?: boolean; error?: string; }
export interface StackFrame    { index: number; file: string; line: number; function: string; current: boolean; }
export interface StackResult   { ok: boolean; frames?: StackFrame[]; currentFrameIndex?: number; error?: string; }
export interface SourceLine    { number: number; content: string; current: boolean; hasBreakpoint: boolean; }
export interface SourceResult  { ok: boolean; lines?: SourceLine[]; error?: string; }

// ─────────────────────────────────────────────────────────────────────────────

export interface IDebugger {

  // Sprint 1 — Breakpoints ✓
  setBreakpoint(file: string, line: number, condition?: string): Promise<BpResult>;
  setTemporaryBreakpoint(file: string, line: number, condition?: string): Promise<BpResult>;
  clearBreakpoint(id: string): Promise<BpResult>;
  clearAllBreakpoints(): Promise<BpListResult>;
  disableBreakpoint(id: string): Promise<BpResult>;
  enableBreakpoint(id: string): Promise<BpResult>;
  ignoreBreakpoint(id: string, count: number): Promise<BpResult>;
  listBreakpoints(): Promise<BpListResult>;

  // Sprint 2 — Session lifecycle
  start(configOrFile: string): Promise<SessionResult>;
  quit(): Promise<SessionResult>;
  restart(args?: string): Promise<SessionResult>;
  status(): Promise<SessionResult>;

  // Sprint 3 — Execution control
  continue(): Promise<StepResult>;
  next(): Promise<StepResult>;
  step(): Promise<StepResult>;
  return(): Promise<StepResult>;
  until(line?: number): Promise<StepResult>;
  jump(line: number): Promise<StepResult>;

  // Sprint 4 — Inspection
  print(expression: string): Promise<InspectResult>;
  prettyPrint(expression: string): Promise<InspectResult>;
  whatis(expression: string): Promise<InspectResult>;
  exec(statement: string): Promise<InspectResult>;
  display(expression?: string): Promise<InspectResult>;
  undisplay(expression?: string): Promise<InspectResult>;
  args(): Promise<InspectResult>;
  retval(): Promise<InspectResult>;

  // Sprint 5 — Stack navigation
  backtrace(count?: number): Promise<StackResult>;
  up(count?: number): Promise<StackResult>;
  down(count?: number): Promise<StackResult>;

  // Sprint 6 — Source listing
  list(first?: number, last?: number): Promise<SourceResult>;
  longlist(): Promise<SourceResult>;
}
