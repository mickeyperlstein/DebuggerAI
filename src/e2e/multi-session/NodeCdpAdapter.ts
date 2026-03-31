/**
 * NodeCdpAdapter.ts — ISessionAdapter implementation via Node.js CDP over WebSocket.
 *
 * Connects to a Node.js process launched with --inspect-brk=0 and speaks the
 * Chrome DevTools Protocol to control execution, set breakpoints, and inspect values.
 */

import WebSocket from 'ws';
import { ISessionAdapter, StopEvent, ExecCmd, EvalResult } from '../../ISessionAdapter';

interface CdpCallFrame {
  callFrameId: string;
  functionName: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  url: string;
  scopeChain: CdpScope[];
}

interface CdpScope {
  type: string;
  object: {
    type: string;
    objectId?: string;
    description?: string;
  };
  name?: string;
  startLocation?: { scriptId: string; lineNumber: number; columnNumber: number };
  endLocation?: { scriptId: string; lineNumber: number; columnNumber: number };
}

interface CdpPausedEvent {
  callFrames: CdpCallFrame[];
  reason: string;
  data?: unknown;
  hitBreakpoints?: string[];
}

// Map from a synthetic variablesReference integer to a CDP objectId string.
// Resets on each pause.
type ScopeStore = Map<number, string>;

export class NodeCdpAdapter implements ISessionAdapter {
  private ws!: WebSocket;
  private msgId = 0;
  private pendingCmds = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private pauseResolvers: Array<(e: StopEvent | null) => void> = [];
  private breakpoints: Array<{ url: string; lineNumber: number }> = [];

  /** Last paused CDP event — used by scopes() / variables() / evaluate(). */
  private lastPausedEvent: CdpPausedEvent | null = null;
  /** Scope store: variablesReference → CDP objectId. Rebuilt on every pause. */
  private scopeStore: ScopeStore = new Map();
  private nextVarRef = 1;

  private onEventCallback?: (topic: string, payload: unknown) => void;

  constructor(
    private readonly wsUrl: string,
    onEvent?: (topic: string, payload: unknown) => void,
  ) {
    this.onEventCallback = onEvent;
  }

  // ── Connection ───────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.once('error', reject);
      this.ws.once('open', async () => {
        this.ws.removeListener('error', reject);
        this.ws.on('message', (data: Buffer) => this.onMessage(data.toString()));
        this.ws.on('error', (err) => {
          // Resolve all pending pause waiters on socket error
          const resolvers = [...this.pauseResolvers];
          this.pauseResolvers = [];
          for (const r of resolvers) r(null);
          for (const [, p] of this.pendingCmds) p.reject(err);
          this.pendingCmds.clear();
        });
        try {
          await this.sendCommand('Debugger.enable');
          await this.sendCommand('Runtime.enable');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // ── ISessionAdapter ──────────────────────────────────────────────────────────

  /**
   * startDebugging — sets breakpoints then resumes from the initial --inspect-brk
   * pause, waiting for the first real breakpoint hit.
   */
  async startDebugging(_script: string): Promise<StopEvent | null> {
    // Set all pre-registered breakpoints
    for (const bp of this.breakpoints) {
      try {
        await this.sendCommand('Debugger.setBreakpointByUrl', {
          url: bp.url,
          lineNumber: bp.lineNumber,
          columnNumber: 0,
        });
      } catch {
        // Breakpoint may not resolve yet if the script hasn't loaded — that's OK
      }
    }

    // Resume from the initial --inspect-brk pause and wait for the next stop
    const pausePromise = this.waitForPause();
    await this.sendCommand('Debugger.resume');
    return pausePromise;
  }

  async stopDebugging(): Promise<void> {
    // Resolve all pending waiters so the test doesn't hang
    const resolvers = [...this.pauseResolvers];
    this.pauseResolvers = [];
    for (const r of resolvers) r(null);
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }

  async restartDebugging(): Promise<StopEvent> {
    // Not directly supported via CDP without the target — best effort: resume and wait
    const pausePromise = this.waitForPause();
    await this.sendCommand('Debugger.resume');
    const ev = await pausePromise;
    if (!ev) throw new Error('process exited during restart');
    return ev;
  }

  async sendExecution(cmd: ExecCmd): Promise<StopEvent | null> {
    const pausePromise = this.waitForPause();
    switch (cmd) {
      case 'continue': await this.sendCommand('Debugger.resume'); break;
      case 'next':     await this.sendCommand('Debugger.stepOver'); break;
      case 'stepIn':   await this.sendCommand('Debugger.stepInto'); break;
      case 'stepOut':  await this.sendCommand('Debugger.stepOut'); break;
    }
    return pausePromise;
  }

  async sendUntil(file: string, line: number): Promise<StopEvent | null> {
    // Set a temporary breakpoint, resume, wait for it, then remove it
    const resp = await this.sendCommand('Debugger.setBreakpointByUrl', {
      url: `file://${file}`,
      lineNumber: line - 1, // convert 1-based to 0-based
      columnNumber: 0,
    }) as { breakpointId: string };

    const pausePromise = this.waitForPause();
    await this.sendCommand('Debugger.resume');
    const stop = await pausePromise;

    try {
      await this.sendCommand('Debugger.removeBreakpoint', { breakpointId: resp.breakpointId });
    } catch {
      // ignore removal errors
    }
    return stop;
  }

  async sendJump(
    _file: string,
    _line: number,
  ): Promise<{ file: string; line: number; reason: string } | { ok: false; error: string }> {
    // CDP does not support arbitrary jump; return an error.
    return { ok: false, error: 'jump not supported via CDP' };
  }

  async evaluate(expression: string, frameId: number, _context?: string): Promise<EvalResult> {
    if (!this.lastPausedEvent) {
      return { error: 'not paused' };
    }

    // frameId from DebugStateMachine is the index into callFrames
    // (we store index as frameId — see _buildStopEvent)
    const frames = this.lastPausedEvent.callFrames;
    const frame = frames[frameId] ?? frames[0];
    if (!frame) return { error: 'no call frame available' };

    try {
      const resp = await this.sendCommand('Debugger.evaluateOnCallFrame', {
        callFrameId: frame.callFrameId,
        expression,
        generatePreview: false,
        returnByValue: true,
      }) as {
        result: { type: string; value?: unknown; description?: string; objectId?: string };
        exceptionDetails?: { text: string };
      };

      if (resp.exceptionDetails) {
        return { error: resp.exceptionDetails.text };
      }
      const r = resp.result;
      const value = r.value !== undefined ? JSON.stringify(r.value) : (r.description ?? String(r.value));
      return { result: value, type: r.type };
    } catch (e) {
      return { error: String(e) };
    }
  }

  async scopes(frameId: number): Promise<{
    scopes: Array<{ name: string; presentationHint?: string; variablesReference: number }>;
  }> {
    if (!this.lastPausedEvent) return { scopes: [] };

    const frames = this.lastPausedEvent.callFrames;
    const frame = frames[frameId] ?? frames[0];
    if (!frame) return { scopes: [] };

    const scopes = frame.scopeChain.map(scope => {
      let ref = 0;
      if (scope.object.objectId) {
        ref = this.nextVarRef++;
        this.scopeStore.set(ref, scope.object.objectId);
      }
      const hint = scope.type === 'local' ? 'locals'
        : scope.type === 'global' ? 'globals'
        : scope.type === 'closure' ? 'closure'
        : undefined;
      return {
        name: scope.name ?? scope.type,
        presentationHint: hint,
        variablesReference: ref,
      };
    });

    return { scopes };
  }

  async variables(variablesReference: number): Promise<{
    variables: Array<{ name: string; value: string; type?: string }>;
  }> {
    const objectId = this.scopeStore.get(variablesReference);
    if (!objectId) return { variables: [] };

    try {
      const resp = await this.sendCommand('Runtime.getProperties', {
        objectId,
        ownProperties: true,
        generatePreview: false,
      }) as {
        result: Array<{
          name: string;
          value?: { type: string; value?: unknown; description?: string; objectId?: string };
        }>;
      };

      const variables = resp.result
        .filter(p => p.value !== undefined)
        .map(p => {
          const v = p.value!;
          const value = v.value !== undefined ? JSON.stringify(v.value) : (v.description ?? 'undefined');
          return { name: p.name, value, type: v.type };
        });

      return { variables };
    } catch {
      return { variables: [] };
    }
  }

  // ── Helpers (public) ─────────────────────────────────────────────────────────

  /**
   * Register a breakpoint to be set when startDebugging() is called.
   * lineNumber is 0-indexed (CDP convention).
   */
  addBreakpoint(url: string, lineNumber: number): void {
    this.breakpoints.push({ url, lineNumber });
  }

  // ── Helpers (private) ────────────────────────────────────────────────────────

  private sendCommand(method: string, params?: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pendingCmds.set(id, { resolve, reject });
      const msg = JSON.stringify({ id, method, params: params ?? {} });
      this.ws.send(msg, err => {
        if (err) {
          this.pendingCmds.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Register a one-shot listener for the next Debugger.paused event.
   * MUST be called BEFORE the command that will trigger the pause.
   */
  private waitForPause(): Promise<StopEvent | null> {
    return new Promise<StopEvent | null>(resolve => {
      this.pauseResolvers.push(resolve);
    });
  }

  private onMessage(data: string): void {
    let msg: {
      id?: number;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: unknown;
    };

    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // ── Command response ──
    if (msg.id !== undefined) {
      const pending = this.pendingCmds.get(msg.id);
      if (pending) {
        this.pendingCmds.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // ── Events ──
    if (msg.method === 'Debugger.paused') {
      const params = msg.params as CdpPausedEvent;
      this.lastPausedEvent = params;

      // Rebuild scope store on each pause
      this.scopeStore = new Map();
      this.nextVarRef = 1;

      const stop = this._buildStopEvent(params);
      this.onEventCallback?.('debugger.paused', stop);

      // Resolve all waiting pause promises
      const resolvers = [...this.pauseResolvers];
      this.pauseResolvers = [];
      for (const r of resolvers) r(stop);
    }

    if (msg.method === 'Debugger.resumed') {
      this.onEventCallback?.('debugger.resumed', {});
    }

    if (msg.method === 'Runtime.executionContextDestroyed') {
      // Process exited — resolve all pause waiters with null
      const resolvers = [...this.pauseResolvers];
      this.pauseResolvers = [];
      for (const r of resolvers) r(null);
      this.onEventCallback?.('session.exit', { reason: 'executionContextDestroyed' });
    }
  }

  private _buildStopEvent(params: CdpPausedEvent): StopEvent {
    const frame = params.callFrames[0];
    const location = frame?.location ?? { lineNumber: 0 };
    const url = frame?.url ?? '';

    // Convert file:// URL to a filesystem path
    let file = url;
    if (url.startsWith('file://')) {
      file = decodeURIComponent(url.slice('file://'.length));
    }

    // CDP line numbers are 0-indexed; StopEvent expects 1-based
    const line = location.lineNumber + 1;

    const reasonMap: Record<string, string> = {
      breakpoint: 'breakpoint',
      step: 'step',
      exception: 'exception',
      other: 'pause',
    };

    return {
      file,
      line,
      function: frame?.functionName ?? undefined,
      reason: (reasonMap[params.reason] ?? 'pause') as StopEvent['reason'],
      // frameId is the index into callFrames array — used by evaluate/scopes
      frameId: 0,
    };
  }
}
