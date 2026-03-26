import * as crypto from 'crypto';
import { ISessionAdapter, StopEvent } from './ISessionAdapter';
import { SessionResult, SessionState, StepResult, InspectResult } from './interfaces/IDebugger';
import { log } from './log';

/**
 * Pure session state machine.
 * No vscode imports — depends only on ISessionAdapter (injected).
 */
export class SessionManager {
  private state: SessionState = 'idle';
  private sessionId: string | null = null;
  private file: string | null = null;
  private line: number | null = null;
  private frameId: number | null = null;
  private displayRegistry = new Set<string>();

  constructor(private readonly adapter: ISessionAdapter) {}

  async start(configName: string): Promise<SessionResult> {
    if (this.state !== 'idle' && this.state !== 'exited') {
      return { state: this.state, error: 'session already running', ok: false };
    }
    this.state = 'starting';
    const event = await this.adapter.startDebugging(configName);
    if (!event) {
      this.state = 'idle';
      return { state: 'idle', error: `config not found: ${configName}`, ok: false };
    }
    this.sessionId = crypto.randomUUID();
    this.setPaused(event.file, event.line, event.frameId);
    log({ event: 'session_start', config: configName, sessionId: this.sessionId });
    return { state: 'paused', sessionId: this.sessionId, file: event.file, line: event.line, ok: true };
  }

  async quit(): Promise<SessionResult> {
    if (this.state === 'idle' || this.state === 'exited') {
      return { state: 'idle', ok: true };
    }
    await this.adapter.stopDebugging();
    this.reset();
    log({ event: 'session_quit' });
    return { state: 'idle', ok: true };
  }

  async restart(_args?: string): Promise<SessionResult> {
    if (this.state === 'idle' || this.state === 'exited') {
      return { state: 'idle', error: 'no session running', ok: false };
    }
    const event = await this.adapter.restartDebugging();
    this.setPaused(event.file, event.line, event.frameId);
    log({ event: 'session_restart' });
    return { state: 'paused', file: event.file, line: event.line, sessionId: this.sessionId ?? undefined, ok: true };
  }

  async status(): Promise<SessionResult> {
    return {
      state: this.state,
      file: this.file ?? undefined,
      line: this.line ?? undefined,
      sessionId: this.sessionId ?? undefined,
      ok: true,
    };
  }

  // ── Sprint 3 — Execution control ─────────────────────────────────────────

  async continue(): Promise<StepResult> {
    if (this.state !== 'paused') return { state: this.state, error: 'not paused', ok: false };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('continue'));
  }

  async next(): Promise<StepResult> {
    if (this.state !== 'paused') return { state: this.state, error: 'not paused', ok: false };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('next'));
  }

  async step(): Promise<StepResult> {
    if (this.state !== 'paused') return { state: this.state, error: 'not paused', ok: false };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('stepIn'));
  }

  async return(): Promise<StepResult> {
    if (this.state !== 'paused') return { state: this.state, error: 'not paused', ok: false };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('stepOut'));
  }

  async until(line?: number): Promise<StepResult> {
    if (this.state !== 'paused') return { state: this.state, error: 'not paused', ok: false };
    this.setRunning();
    const ev = line !== undefined
      ? await this.adapter.sendUntil(this.file ?? '', line)
      : await this.adapter.sendExecution('next');
    return this.applyStop(ev);
  }

  async jump(line: number): Promise<StepResult> {
    if (this.state !== 'paused') return { state: this.state, error: 'not paused', ok: false };
    const result = await this.adapter.sendJump(this.file ?? '', line);
    if ('error' in result) return { state: 'paused', error: result.error, ok: false };
    this.setPaused(result.file, result.line, result.frameId);
    return { state: 'paused', file: result.file, line: result.line, reason: result.reason, ok: true };
  }

  // ── Sprint 4 — Inspection ─────────────────────────────────────────────────

  async print(expression: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
    if ('error' in r) return { error: r.error, ok: false };
    return { valueRepr: r.result, type: r.type, ok: true };
  }

  async prettyPrint(expression: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
    if ('error' in r) return { error: r.error, ok: false };
    return { valueRepr: r.result, type: r.type, ok: true };
  }

  async whatis(expression: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
    if ('error' in r) return { error: r.error, ok: false };
    return { type: r.type, valueRepr: r.type, ok: true };
  }

  async display(expression?: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    if (expression) {
      this.displayRegistry.add(expression);
      const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
      if ('error' in r) return { error: r.error, ok: false };
      return { valueRepr: `${expression} = ${r.result}`, ok: true };
    }
    // No expression — evaluate all registered
    const reprs: string[] = [];
    for (const expr of this.displayRegistry) {
      const r = await this.adapter.evaluate(expr, this.frameId, 'repl');
      reprs.push('error' in r ? `${expr} = <error: ${r.error}>` : `${expr} = ${r.result}`);
    }
    return { valueRepr: reprs.join('\n') || '(no display expressions registered)', ok: true };
  }

  async exec(statement: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    const r = await this.adapter.evaluate(statement, this.frameId, 'repl');
    if ('error' in r) return { error: r.error, ok: false };
    return { valueRepr: r.result, ok: true };
  }

  async undisplay(expression?: string): Promise<InspectResult> {
    if (expression) {
      this.displayRegistry.delete(expression);
    } else {
      this.displayRegistry.clear();
    }
    return { ok: true };
  }

  async args(): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    const scopesResp = await this.adapter.scopes(this.frameId);
    const argScope = scopesResp.scopes.find(s => s.presentationHint === 'arguments');
    if (!argScope) return { error: 'no arguments scope available', ok: false };
    const varsResp = await this.adapter.variables(argScope.variablesReference);
    const repr = varsResp.variables.map(v => `${v.name} = ${v.value}`).join(', ');
    return { valueRepr: repr, value: varsResp.variables, ok: true };
  }

  async retval(): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { error: 'not paused', ok: false };
    const scopesResp = await this.adapter.scopes(this.frameId);
    for (const scope of scopesResp.scopes) {
      const varsResp = await this.adapter.variables(scope.variablesReference);
      const retVar = varsResp.variables.find(v => v.name === '(return value)');
      if (retVar) return { valueRepr: retVar.value, type: retVar.type, ok: true };
    }
    return { error: 'no return value in scope', ok: false };
  }

  // ── State hooks ───────────────────────────────────────────────────────────

  setPaused(file: string, line: number, frameId?: number | null): void {
    this.state = 'paused';
    this.file = file;
    this.line = line;
    this.frameId = frameId ?? null;
  }
  setRunning(): void { this.state = 'running'; }
  setExited(): void { this.reset(); this.state = 'exited'; }

  private applyStop(ev: StopEvent | null): StepResult {
    if (!ev || ev.reason === 'exited') {
      this.setExited();
      return { state: 'exited', ok: true };
    }
    this.setPaused(ev.file, ev.line, ev.frameId);
    return { state: 'paused', file: ev.file, line: ev.line, reason: ev.reason, function: ev.function, ok: true };
  }

  private reset(): void {
    this.state = 'idle';
    this.sessionId = null;
    this.file = null;
    this.line = null;
    this.frameId = null;
    this.displayRegistry.clear();
  }
}
