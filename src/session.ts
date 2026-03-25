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
      return { ok: false, state: this.state, error: 'session already running' };
    }
    this.state = 'starting';
    const event = await this.adapter.startDebugging(configName);
    if (!event) {
      this.state = 'idle';
      return { ok: false, state: 'idle', error: `config not found: ${configName}` };
    }
    this.sessionId = crypto.randomUUID();
    this.setPaused(event.file, event.line, event.frameId);
    log({ event: 'session_start', config: configName, sessionId: this.sessionId });
    return { ok: true, state: 'paused', sessionId: this.sessionId, file: event.file, line: event.line };
  }

  async quit(): Promise<SessionResult> {
    if (this.state === 'idle' || this.state === 'exited') {
      return { ok: true, state: 'idle' };
    }
    await this.adapter.stopDebugging();
    this.reset();
    log({ event: 'session_quit' });
    return { ok: true, state: 'idle' };
  }

  async restart(_args?: string): Promise<SessionResult> {
    if (this.state === 'idle' || this.state === 'exited') {
      return { ok: false, state: 'idle', error: 'no session running' };
    }
    const event = await this.adapter.restartDebugging();
    this.setPaused(event.file, event.line, event.frameId);
    log({ event: 'session_restart' });
    return { ok: true, state: 'paused', file: event.file, line: event.line, sessionId: this.sessionId ?? undefined };
  }

  async status(): Promise<SessionResult> {
    return {
      ok: true,
      state: this.state,
      file: this.file ?? undefined,
      line: this.line ?? undefined,
      sessionId: this.sessionId ?? undefined,
    };
  }

  // ── Sprint 3 — Execution control ─────────────────────────────────────────

  async continue(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('continue'));
  }

  async next(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('next'));
  }

  async step(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('stepIn'));
  }

  async return(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('stepOut'));
  }

  async until(line?: number): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    const ev = line !== undefined
      ? await this.adapter.sendUntil(this.file ?? '', line)
      : await this.adapter.sendExecution('next');
    return this.applyStop(ev);
  }

  async jump(line: number): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    const result = await this.adapter.sendJump(this.file ?? '', line);
    if ('error' in result) return { ok: false, state: 'paused', error: result.error };
    this.setPaused(result.file, result.line, result.frameId);
    return { ok: true, state: 'paused', file: result.file, line: result.line, reason: result.reason };
  }

  // ── Sprint 4 — Inspection ─────────────────────────────────────────────────

  async print(expression: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
    if ('error' in r) return { ok: false, error: r.error };
    return { ok: true, valueRepr: r.result, type: r.type };
  }

  async prettyPrint(expression: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
    if ('error' in r) return { ok: false, error: r.error };
    return { ok: true, valueRepr: r.result, type: r.type };
  }

  async whatis(expression: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
    if ('error' in r) return { ok: false, error: r.error };
    return { ok: true, type: r.type, valueRepr: r.type };
  }

  async display(expression?: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    if (expression) {
      this.displayRegistry.add(expression);
      const r = await this.adapter.evaluate(expression, this.frameId, 'repl');
      if ('error' in r) return { ok: false, error: r.error };
      return { ok: true, valueRepr: `${expression} = ${r.result}` };
    }
    // No expression — evaluate all registered
    const reprs: string[] = [];
    for (const expr of this.displayRegistry) {
      const r = await this.adapter.evaluate(expr, this.frameId, 'repl');
      reprs.push('error' in r ? `${expr} = <error: ${r.error}>` : `${expr} = ${r.result}`);
    }
    return { ok: true, valueRepr: reprs.join('\n') || '(no display expressions registered)' };
  }

  async exec(statement: string): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    const r = await this.adapter.evaluate(statement, this.frameId, 'repl');
    if ('error' in r) return { ok: false, error: r.error };
    return { ok: true, valueRepr: r.result };
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
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    const scopesResp = await this.adapter.scopes(this.frameId);
    const argScope = scopesResp.scopes.find(s => s.presentationHint === 'arguments');
    if (!argScope) return { ok: false, error: 'no arguments scope available' };
    const varsResp = await this.adapter.variables(argScope.variablesReference);
    const repr = varsResp.variables.map(v => `${v.name} = ${v.value}`).join(', ');
    return { ok: true, valueRepr: repr, value: varsResp.variables };
  }

  async retval(): Promise<InspectResult> {
    if (this.state !== 'paused' || this.frameId === null) return { ok: false, error: 'not paused' };
    const scopesResp = await this.adapter.scopes(this.frameId);
    for (const scope of scopesResp.scopes) {
      const varsResp = await this.adapter.variables(scope.variablesReference);
      const retVar = varsResp.variables.find(v => v.name === '(return value)');
      if (retVar) return { ok: true, valueRepr: retVar.value, type: retVar.type };
    }
    return { ok: false, error: 'no return value in scope' };
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
      return { ok: true, state: 'exited' };
    }
    this.setPaused(ev.file, ev.line, ev.frameId);
    return { ok: true, state: 'paused', file: ev.file, line: ev.line, reason: ev.reason, function: ev.function };
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
