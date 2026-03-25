/**
 * Dependency-inversion boundary between SessionManager and vscode.debug.
 * Same pattern as IDebugAdapter — manager never imports vscode.
 */

import { StopReason } from './interfaces/IDebugger';

export interface StopEvent {
  file: string;
  line: number;
  function?: string;
  reason: StopReason;
  /** DAP frame ID — cached so inspection commands can evaluate in the current frame. */
  frameId?: number;
  /**
   * The thread ID from the stop event.
   * Carried by VsCodeDapProxy so strategies (e.g. PythonStrategy) can issue a
   * fresh stackTrace request at evaluate time to resolve the raw adapter frame ID.
   */
  threadId?: number;
}

/** DAP step commands mapped to their protocol names. */
export type ExecCmd = 'continue' | 'next' | 'stepIn' | 'stepOut';

/** Return type of adapter.evaluate — either a value or an error string. */
export type EvalResult = { result: string; type?: string } | { error: string };

export interface ISessionAdapter {
  /** Start a named launch config. Returns null if config not found. */
  startDebugging(configName: string): Promise<StopEvent | null>;
  stopDebugging(): Promise<void>;
  restartDebugging(): Promise<StopEvent>;

  // Sprint 3 — execution control
  /** Send a DAP step/continue command. Returns null when the session exits. */
  sendExecution(cmd: ExecCmd): Promise<StopEvent | null>;
  /** Run to a specific line in the current frame (temp breakpoint + continue). */
  sendUntil(file: string, line: number): Promise<StopEvent | null>;
  /** Set the next statement via DAP goto. Returns error shape if not allowed. */
  sendJump(file: string, line: number): Promise<StopEvent | { ok: false; error: string }>;

  // Sprint 4 — inspection (DAP evaluate / scopes / variables)
  /** Evaluate an expression in the given frame. Returns error shape on failure. */
  evaluate(expression: string, frameId: number, context?: string): Promise<EvalResult>;
  /** Fetch DAP scopes for a frame (used by args()). */
  scopes(frameId: number): Promise<{ scopes: Array<{ name: string; presentationHint?: string; variablesReference: number }> }>;
  /** Fetch variables in a scope reference (used by args() and retval()). */
  variables(variablesReference: number): Promise<{ variables: Array<{ name: string; value: string; type?: string }> }>;
}
