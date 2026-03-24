/**
 * Dependency-inversion boundary between BreakpointManager and vscode.debug.
 * The manager never imports vscode — it depends on this interface.
 * Tests inject a fake; extension.ts injects the real vscode implementation.
 */

export interface IDebugAdapter {
  addBreakpoint(file: string, line: number, condition?: string, enabled?: boolean): void;
  removeBreakpoint(file: string, line: number): void;
}
