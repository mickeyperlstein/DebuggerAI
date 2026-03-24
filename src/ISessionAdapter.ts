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
}

/** DAP step commands mapped to their protocol names. */
export type ExecCmd = 'continue' | 'next' | 'stepIn' | 'stepOut';

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
}
