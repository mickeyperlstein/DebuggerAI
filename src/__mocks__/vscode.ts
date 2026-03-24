/** Minimal vscode stub for Jest — only what the source files reference. */
export const window = {
  createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() })),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  activeTextEditor: undefined,
};
export const debug = {
  addBreakpoints: jest.fn(),
  removeBreakpoints: jest.fn(),
  breakpoints: [] as any[],
  startDebugging: jest.fn().mockResolvedValue(true),
  stopDebugging: jest.fn().mockResolvedValue(undefined),
  onDidReceiveDebugSessionCustomEvent: jest.fn(() => ({ dispose: jest.fn() })),
  onDidStartDebugSession: jest.fn(() => ({ dispose: jest.fn() })),
  onDidTerminateDebugSession: jest.fn(() => ({ dispose: jest.fn() })),
  activeDebugSession: undefined as any,
  registerDebugAdapterTrackerFactory: jest.fn(() => ({ dispose: jest.fn() })),
};

export class EventEmitter<T> {
  private listeners: Array<(e: T) => any> = [];
  event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: T): void { this.listeners.forEach(l => l(data)); }
  dispose(): void { this.listeners = []; }
}
export const commands = { registerCommand: jest.fn() };
export const workspace = {
  getConfiguration: jest.fn(() => ({ get: jest.fn(() => 7890) })),
  workspaceFolders: undefined as any,
};
export class Uri          { static file = (p: string) => ({ fsPath: p }); }
export class Position     { constructor(public line: number, public character: number) {} }
export class Location     { constructor(public uri: any, public range: any) {} }
export class SourceBreakpoint { constructor(public location: any, public enabled?: boolean, public condition?: string) {} }
